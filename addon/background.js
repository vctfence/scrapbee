import {NODE_TYPE_BOOKMARK} from "./db.js";
import {backend} from "./backend.js";
import {exportOrg, importOrg} from "./import.js";
import {settings} from "./settings.js";

/* Internal message listener */

browser.runtime.onMessage.addListener(message => {
    switch (message.type) {
        case "CREATE_BOOKMARK":
            backend.addBookmark(message.data, NODE_TYPE_BOOKMARK).then(bookmark => {
                browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: bookmark});
            });
            break;

        case "BROWSE_ARCHIVE":
            return backend.fetchBlob(message.node.id).then(blob => {
                if (blob) {
                    let htmlBlob = new Blob([blob.data], {type: blob.type? blob.type: "text/html"});
                    let objectURL = URL.createObjectURL(htmlBlob);
                    let archiveURL = objectURL + "#" + message.node.uuid + ":" + message.node.id;

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
                    browser.tabs.executeScript({code : `alert("Error: no data is stored.");`});
                }
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
