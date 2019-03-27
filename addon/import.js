import * as org from "./lib/org.js"
import {backend} from "./backend.js"

function traverseOrgNode(node, callback) {
    callback(node);
    if (node.children.length)
        for (let c of node.children)
            traverseOrgNode(c, callback);
}

function rankOrgLine(line) {
    if (line.length === 2 && line.some(l => l.type === "header"))
        return "header";
    else if (line.length === 1 && line[0].type === "drawer")
        return "drawer";
    else if (line.length === 1 && line[0].type === "text")
        return "text";
}

export async function importOrg(shelf, text) {
    let org_lines = new org.Parser().parse(text);

    let path = [shelf];
    let level = 0;

    for (let line of org_lines.nodes) {
        let subnodes = [];
        traverseOrgNode(line, n => subnodes.push(n));
        subnodes = subnodes.filter(n => !(n.type === "inlineContainer"
                                           || n.type === "text" && !n.value));
        let line_type = rankOrgLine(subnodes);

        if (line_type === "header") {
            if (subnodes[0].level > level) {
                level += 1;
                path.push(subnodes[1].value);
            }
            else if (subnodes[0].level < level) {
                level -= 1;
                path.pop()
            }
            else {
                path[path.length - 1] = subnodes[1].value;
            }
        }

        let link = subnodes.find(n => n.type === "link");
        if (link) {
            if (subnodes[0].level === level) {
                level -= 1;
                path.pop()
            }
            let index = subnodes.indexOf(link);
            await backend.addBookmark({
                name: subnodes[index + 1].value,
                uri: subnodes[index].src,
                path: path.join("/")
            });
        }
    }
}
