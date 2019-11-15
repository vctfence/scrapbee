import {backend} from "./backend.js";

async function browseBookmark(tab) {
    let url = decodeURIComponent(new URL(tab.url).hash.substr(1));
    let id = /ext\+scrapyard:\/\/([^#/]+)/i.exec(url)[1];
    let [prefix, uuid] = id.includes(":")
            ? id.split(":")
            : [null, id];
    let node = await backend.getNode(uuid, true);

    if (!prefix)
        browser.runtime.sendMessage({type: "BROWSE_NODE", node: node, tab: tab});
    else
        switch (prefix) {
            case "notes":
                browser.runtime.sendMessage({type: "BROWSE_NOTES", uuid: node.uuid, id: node.id, tab: tab});
                break;
        }
}

browser.tabs.getCurrent().then(browseBookmark);
