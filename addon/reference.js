import {send} from "./proxy.js";
import {Node} from "./storage_entities.js";
import {systemInitialization} from "./bookmarks_init.js";
import {updateTabURL} from "./utils_browser.js";

async function openReference(tab) {
    await systemInitialization;

    let url = decodeURIComponent(new URL(tab.url).hash.substr(1));

    if (url && url.startsWith("ext+scrapyard:")) {
        let id = /ext\+scrapyard:\/\/([^#/]+)/i.exec(url)[1];

        switch (id) {
            case "advanced":
                return updateTabURL(tab, browser.runtime.getURL("ui/options.html#advanced"), false);
        }

        let [prefix, uuid] = id.includes(":")? id.split(":"): [null, id];
        let node = await Node.getByUUID(uuid);

        if (!prefix)
            send.browseNode({node: node, tab: tab});
        else
            switch (prefix) {
                case "notes":
                    send.browseNotes({uuid: node.uuid, tab: tab});
                    break;
            }
    }
}

browser.tabs.getCurrent().then(openReference);
window.onhashchange = () => browser.tabs.getCurrent().then(openReference);
