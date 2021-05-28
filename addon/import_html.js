import {backend} from "./backend.js";
import {DEFAULT_POSITION, NODE_TYPE_BOOKMARK} from "./storage.js";
import {prepareNewImport} from "./import.js";

export async function importHtml(shelf, text) {
    await prepareNewImport(shelf);

    let html = jQuery.parseHTML(text);
    let root = html.find(e => e.localName === "dl");
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
                    node = await backend.importBookmark({
                        uri: node.href,
                        name: node.textContent,
                        type: NODE_TYPE_BOOKMARK,
                        pos: DEFAULT_POSITION,
                        path: path.join("/")
                    });

                    await backend.storeIconFromURI(node)
                }
            }
            else if (child.localName === "dl") {
                await traverseHtml(child, path);
            }
        }
    }

    await traverseHtml(root, path);
}
