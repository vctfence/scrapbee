import Storage from "./db.js"
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "./db.js";
import {backend} from "./backend.js";

let storage = new Storage();

browser.runtime.onMessage.addListener(message => {
    switch (message.type) {
        case "CREATE_BOOKMARK":
            backend.addBookmark(message.data, NODE_TYPE_BOOKMARK).then(bookmark => {
                browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: bookmark});
            });
            break;
    }
});

console.log("==> background.js loaded")
