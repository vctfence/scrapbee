import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES} from "./db.js";
import {backend} from "./backend.js";
import {exportOrg, importOrg, importHtml} from "./import.js";
import {settings} from "./settings.js";
import {showNotification} from "./utils.js";

export function browseNode(node) {
    switch (node.type) {
        case NODE_TYPE_BOOKMARK:
            let url = node.uri;
            if (url) {
                if (url.indexOf("://") < 0)
                    url = "http://" + url;
            }

            return browser.tabs.create({"url": url});
            break;
        case NODE_TYPE_ARCHIVE:
            return backend.fetchBlob(node.id).then(blob => {
                if (blob) {

                    if (blob.byte_length) {
                        let byteArray = new Uint8Array(blob.byte_length);
                        for (let i = 0; i < blob.data.length; ++i)
                            byteArray[i] = blob.data.charCodeAt(i);

                        blob.data = byteArray;
                    }

                    let object = new Blob([blob.data], {type: blob.type? blob.type: "text/html"});
                    let objectURL = URL.createObjectURL(object);
                    let archiveURL = objectURL + "#" + node.uuid + ":" + node.id;

                    setTimeout(() => {
                        URL.revokeObjectURL(objectURL);
                    }, settings.archive_url_lifetime() * 60 * 1000);

                    browser.tabs.create({
                        "url": archiveURL
                    }).then(tab => {
                        return browser.tabs.executeScript(tab.id, {
                            file: "edit-bootstrap.js",
                            runAt: 'document_end'
                        })
                    });
                }
                else {
                    showNotification({message: "No data is stored."});
                }
            });
            break;
        case NODE_TYPE_NOTES:
            browser.tabs.create({
                "url": "notes.html#" + node.uuid + ":" + node.id
            });
            break;
    }
}


/* Internal message listener */

browser.runtime.onMessage.addListener(message => {
    switch (message.type) {
        case "CREATE_BOOKMARK":
            backend.addBookmark(message.data, NODE_TYPE_BOOKMARK).then(bookmark => {
                browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: bookmark});
            });
            break;

        case "BROWSE_NODE":
            browseNode(message.node);
            break;

        case "BROWSE_NOTES":
            browser.tabs.create({
                "url": "notes.html#" + message.node.uuid + ":" + message.node.id
            });
            break;

        case "IMPORT_FILE":
            let reader = new FileReader();

            return new Promise((resolve, reject) => {
                reader.onload = function (re) {
                    let importF;

                    switch (message.file_ext.toUpperCase()) {
                        case "ORG":
                            importF = () => {
                                return importOrg(message.file_name, re.target.result);
                            };
                            break;
                        case "HTML":
                            importF = () => {
                                return importHtml(message.file_name, re.target.result);
                            };
                            break;
                    }

                    if (importF)
                        return importF().then(() => resolve());
                };

                reader.readAsText(message.file);
            });
            break;

        case "EXPORT_FILE":
            return exportOrg(message.nodes, message.shelf, message.uuid,
                settings.shallow_export(), settings.compress_export()).then(url => {
                    return browser.downloads.download({url: url, filename: message.shelf + ".org", saveAs: false});
            });
            break;
    }
});


console.log("==> background.js loaded");
