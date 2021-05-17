import {backend} from "./backend.js"

import {DEFAULT_SHELF_NAME, EVERYTHING} from "./storage_constants.js";

export async function prepareNewImport(shelf) {
    if (shelf === EVERYTHING) {
        return backend.wipeEveritying();
    }
    else {
        shelf = await backend.queryShelf(shelf);

        if (shelf && shelf.name === DEFAULT_SHELF_NAME) {
            return backend.deleteChildNodes(shelf.id);
        } else if (shelf) {
            return backend.deleteNodes(shelf.id);
        }
    }
}
