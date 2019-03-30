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

        case "OPEN_ARCHIVE":
            storage.fetchBlob(message.node.id).then(blob => {
                if (blob) {
                    let htmlBlob = new Blob([blob.data], {type: "text/html"});
                    let objectURL = URL.createObjectURL(htmlBlob);
                    let archiveURL = objectURL + "#" + message.node.uuid + ":" + message.node.id;

                    setTimeout(() => {
                        URL.revokeObjectURL(objectURL);
                    }, 200000);

                    browser.tabs.create({
                        "url": archiveURL
                    }).then(tab => {
                        browser.tabs.executeScript(tab.id, {
                            file: "edit-bootstrap.js",
                            runAt: 'document_end'
                        });
                    });
                }
                else
                    console.log("Error: no blob is stored");
            });
            break;
    }
});

console.log("==> background.js loaded")
