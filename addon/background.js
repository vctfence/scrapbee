import {NODE_TYPE_BOOKMARK} from "./db.js";
import {backend} from "./backend.js";

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
