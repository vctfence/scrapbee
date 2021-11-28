import {NODE_TYPE_BOOKMARK} from "./storage.js";
import {Import} from "./import.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {StreamImporterBuilder} from "./import_drivers.js";

async function importHtml(shelf, html) {
    await Import.prepare(shelf);

    let doc = jQuery.parseHTML(html);
    let root = doc.find(e => e.localName === "dl");
    let path = [shelf];

    function peekType(node) {
        for (let child of node.childNodes) {
            if (child.localName === "a")
                return ["link", child];
            else if (child.localName === "h3")
                return ["folder", child];
        }
        return ["unknown", null];
    }

    async function traverseHtml(root, path) {
        for (let child of root.childNodes) {
            if (child.localName === "dt") {
                let [type, node] = peekType(child);
                if (type === "folder") {
                    path.push(node.textContent);
                    await traverseHtml(child, path);
                    path.pop();
                }
                else if (type === "link") {
                    node = await Bookmark.import({
                        uri: node.href,
                        name: node.textContent,
                        type: NODE_TYPE_BOOKMARK,
                        path: path.join("/")
                    });

                    await Bookmark.storeIconFromURI(node)
                }
            }
            else if (child.localName === "dl") {
                await traverseHtml(child, path);
            }
        }
    }

    await traverseHtml(root, path);
}

export class NetscapeImporterBuilder extends StreamImporterBuilder {
    _createImporter(options) {
        return {
            import() {
                return importHtml(options.name, options.stream);
            }
        };
    }
}
