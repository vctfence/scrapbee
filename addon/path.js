import {DEFAULT_SHELF_NAME} from "./storage.js";
import {Node} from "./storage_entities.js";

export class Path {
    // used during reconciliation in browser backend
    // paths may vary depending on the browser UI language
    static storeSubstitute(substitute, path) {
        localStorage.setItem(Path._substitutePrefix + substitute, path);
    }

    static expand(path) {
        if (path && path.startsWith("~"))
            return path.replace("~", DEFAULT_SHELF_NAME);
        else if (path && path.startsWith("@@")) {
            return path.replace("@@", localStorage.getItem(`${Path._substitutePrefix}@@`));
        }
        else if (path && path.startsWith("@"))
            return path.replace("@", localStorage.getItem(`${Path._substitutePrefix}@`));

        return path;
    }

    static _normalize(path) {
        if (path) {
            path = path.trim();
            path = path.replace("\\", "/");

            if (path.startsWith("/"))
                path = path.replace(/^\//, "");
            else if (!path)
                path = DEFAULT_SHELF_NAME;

            return path;
        }
        else
            return DEFAULT_SHELF_NAME;
    }

    static split(path) {
        return Path._normalize(path).split("/").filter(n => !!n);
    }

    static async compute(nodeOrId) {
        let path = [];
        let node = typeof nodeOrId === "number"? await Node.get(nodeOrId): nodeOrId;

        while (node) {
            path.push(node);

            if (node.parent_id)
                node = await Node.get(node.parent_id);
            else
                node = null;
        }

        return path.reverse();
    }

    static async asString(node) {
        const path = await Path.compute(node);
        path.splice(path.length - 1, 1);
        return path.map(n => n.name).join("/");
    }
}

Path._substitutePrefix = "path-substitute-";
