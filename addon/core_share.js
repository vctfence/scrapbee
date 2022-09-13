import {receive} from "./proxy.js";
import {GetPocket} from "./lib/pocket.js";
import {settings} from "./settings.js";
import {showNotification} from "./utils_browser.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES} from "./storage.js";
import {notes2html} from "./notes_render.js";
import {dropboxBackend} from "./backend_dropbox.js";
import {oneDriveBackend} from "./backend_onedrive.js";
import {CONTENT_TYPE_TO_EXT} from "./utils.js";
import {Archive, Notes} from "./storage_entities.js";

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
    let shared = false;

    for (let node of message.nodes) {
        let {filename, content} = await prepareForCloudSharing(node);

        if (filename && content) {
            shared = true;
            await dropboxBackend.share("/", filename, content);
        }
    }

    if (shared)
        showNotification(`Successfully shared bookmark${message.nodes.length > 1? "s": ""} to Dropbox.`)
}

receive.shareToOneDrive = async message => {
    let shared = false;

    for (let node of message.nodes) {
        let {filename, content} = await prepareForCloudSharing(node);

        if (filename && content) {
            shared = true;
            await oneDriveBackend.share("/", filename, content);
        }
    }

    if (shared)
        showNotification(`Successfully shared bookmark${message.nodes.length > 1? "s": ""} to OneDrive.`)
}

async function prepareForCloudSharing(node) {
    let filename, content;

    if (node.type === NODE_TYPE_ARCHIVE) {
        let archive = await Archive.get(node);
        if (archive) {
            const type = archive.type? archive.type: "text/html";
            filename = node.name
            if (!/\.[a-z]{2,8}$/.test(node.name?.toLowerCase())) {
                const ext = CONTENT_TYPE_TO_EXT[type] || "bin";
                filename = node.name + `.${ext}`;
            }

            if (archive.object)
                content = archive.object
            else
                content = new Blob([await Archive.reify(archive)], {type: type});
        }
    }
    else if (node.type === NODE_TYPE_BOOKMARK) {
        filename = node.name + ".url";
        content = "[InternetShortcut]\nURL=" + node.uri;
    }
    else if (node.type === NODE_TYPE_NOTES) {
        let notes = await Notes.get(node);

        if (notes) {
            filename = node.name + ".html";
            content = `<html><head></head><body>`
                + `${notes2html(notes)}`
                + `</body></html>`;
        }
    }

    return {filename, content};
}
