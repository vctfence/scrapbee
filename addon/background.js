import Storage from "./db.js"
import {NODE_TYPE_GROUP, NODE_TYPE_SHELF, NODE_TYPE_BOOKMARK, DEFAULT_SHELF_NAME} from "./db.js";
import {backend} from "./backend.js";

let storage = new Storage();

/* Internal message listener */

browser.runtime.onMessage.addListener(message => {
    switch (message.type) {
        case "CREATE_BOOKMARK":
            backend.addBookmark(message.data, NODE_TYPE_BOOKMARK).then(bookmark => {
                browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: bookmark});
            });
            break;

        case "BROWSE_ARCHIVE":
            backend.browseArchive(message.node);
            break;
    }
});


console.log("==> background.js loaded");
