import {receive} from "./proxy.js";
import {GetPocket} from "./lib/pocket.js";
import {settings} from "./settings.js";
import {showNotification} from "./utils_browser.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES} from "./storage.js";
import {backend} from "./backend.js";
import {notes2html} from "./notes_render.js";
import {dropboxBackend} from "./backend_dropbox.js";
import {CONTENT_TYPE_TO_EXT} from "./utils.js";

receive.shareToPocket = async message => {
    const auth_handler = auth_url => new Promise(async (resolve, reject) => {
        let pocket_tab = await browser.tabs.create({url: auth_url});
        let listener = async (id, changed, tab) => {
            if (id === pocket_tab.id) {
                if (changed.url && !changed.url.includes("getpocket.com")) {
                    await browser.tabs.onUpdated.removeListener(listener);
                    browser.tabs.remove(pocket_tab.id);
                    resolve();
                }
            }
        };
        browser.tabs.onUpdated.addListener(listener);
    });

    let pocket = new GetPocket({
        consumer_key: "87251-b8d5db3009affab6297bc799",
        access_token: settings.pocket_access_token(),
        redirect_uri: "https://gchristensen.github.io/scrapyard/",
        auth_handler: auth_handler,
        persist_token: token => settings.pocket_access_token(token)
    });

    let actions = message.nodes.map(n => ({
        action: "add",
        title: n.name,
        url: n.uri,
        tags: n.tags
    }));
    await pocket.modify(actions).catch(e => console.error(e));

    showNotification(`Successfully added bookmark${message.nodes.length > 1
        ? "s"
        : ""} to Pocket.`)
};

receive.shareToDropbox = async message => {
    for (let node of message.nodes) {
        let filename, content;

        if (node.type === NODE_TYPE_ARCHIVE) {
            let blob = await backend.fetchBlob(node.id);
            if (blob) {
                const type = blob.type ? blob.type : "text/html";
                filename = node.name
                if (!/\.[a-z]{2,8}$/.test(node.name?.toLowerCase())) {
                    const ext = CONTENT_TYPE_TO_EXT[type] || "bin";
                    filename = node.name + `.${ext}`;
                }

                if (blob.object)
                    content = blob.object
                else
                    content = new Blob([await backend.reifyBlob(blob)], {type: type});
            }
        }
        else if (node.type === NODE_TYPE_BOOKMARK) {
            filename = node.name + ".url";
            content = "[InternetShortcut]\nURL=" + node.uri;
        }
        else if (node.type === NODE_TYPE_NOTES) {
            let notes = await backend.fetchNotes(node.id);

            if (notes) {
                filename = node.name + ".html";
                content = `<html><head></head><body>`
                    + `${notes2html(notes.content, notes.format)}`
                    + `</body></html>`;
            }
        }

        if (filename && content) {
            await dropboxBackend.upload("/", filename, content);
            showNotification(`Successfully shared bookmark${message.nodes.length > 1
                ? "s"
                : ""} to Dropbox.`)
        }
    }
}
