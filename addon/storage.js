export const STORAGE_FORMAT = "Scrapyard";

export const NODE_TYPE_SHELF = 1;
export const NODE_TYPE_GROUP = 2;
export const NODE_TYPE_BOOKMARK = 3;
export const NODE_TYPE_ARCHIVE = 4;
export const NODE_TYPE_SEPARATOR = 5;
export const NODE_TYPE_NOTES = 6;
export const NODE_TYPE_UNLISTED = 7;

export const NODE_TYPE_NAMES = {
    [NODE_TYPE_SHELF]: "shelf",
    [NODE_TYPE_GROUP]: "folder",
    [NODE_TYPE_BOOKMARK]: "bookmark",
    [NODE_TYPE_ARCHIVE]: "archive",
    [NODE_TYPE_SEPARATOR]: "separator",
    [NODE_TYPE_NOTES]: "notes"
};

export const ENDPOINT_TYPES = [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES];
export const CONTAINER_TYPES = [NODE_TYPE_SHELF, NODE_TYPE_GROUP, NODE_TYPE_UNLISTED];

export const TODO_STATE_TODO = 1;
export const TODO_STATE_DONE = 4;
export const TODO_STATE_WAITING = 2;
export const TODO_STATE_POSTPONED = 3;
export const TODO_STATE_CANCELLED = 5;

export const TODO_NAMES = {
    [TODO_STATE_TODO]: "TODO",
    [TODO_STATE_WAITING]: "WAITING",
    [TODO_STATE_POSTPONED]: "POSTPONED",
    [TODO_STATE_CANCELLED]: "CANCELLED",
    [TODO_STATE_DONE]: "DONE"
};

export const TODO_STATES = {
    "TODO": TODO_STATE_TODO,
    "WAITING": TODO_STATE_WAITING,
    "POSTPONED": TODO_STATE_POSTPONED,
    "CANCELLED": TODO_STATE_CANCELLED,
    "DONE": TODO_STATE_DONE
};

export const DEFAULT_SHELF_ID = 1;
export const EVERYTHING_SHELF_ID = -1;
export const DONE_SHELF_ID = -2;
export const TODO_SHELF_ID = -3;
export const BROWSER_SHELF_ID = -4;
export const CLOUD_SHELF_ID = -5;

export const TODO_SHELF_NAME = "TODO";
export const TODO_SHELF_UUID = TODO_SHELF_NAME;
export const DONE_SHELF_NAME = "DONE";
export const DONE_SHELF_UUID = DONE_SHELF_NAME;

export const EVERYTHING = "everything";

export const DEFAULT_SHELF_NAME = "default";
export const DEFAULT_SHELF_UUID = DEFAULT_SHELF_ID.toString();

export const BROWSER_SHELF_NAME = "browser";
export const BROWSER_SHELF_UUID = "browser_bookmarks";
export const FIREFOX_BOOKMARK_MENU = "menu________";
export const FIREFOX_BOOKMARK_UNFILED = "unfiled_____";
export const FIREFOX_BOOKMARK_TOOLBAR = "toolbar_____";
export const FIREFOX_BOOKMARK_MOBILE = "mobile______"

export const FIREFOX_SPECIAL_FOLDERS = [FIREFOX_BOOKMARK_MENU, FIREFOX_BOOKMARK_UNFILED, FIREFOX_BOOKMARK_TOOLBAR];

export const BROWSER_EXTERNAL_NAME = BROWSER_SHELF_NAME;

export const CLOUD_SHELF_NAME = "cloud";
export const CLOUD_SHELF_UUID = CLOUD_SHELF_NAME;
export const CLOUD_EXTERNAL_NAME = CLOUD_SHELF_NAME;

export const RDF_EXTERNAL_NAME = "rdf";

export const NON_IMPORTABLE_SHELVES = [BROWSER_SHELF_UUID, CLOUD_SHELF_UUID];

export const NON_SYNCHRONIZED_EXTERNALS = [BROWSER_EXTERNAL_NAME, CLOUD_EXTERNAL_NAME];

export const DEFAULT_POSITION = 2147483647;

export const UNDO_DELETE = 1;

export const NODE_PROPERTIES =
    ["id",
     "pos",
     "uri",
     "name",
     "type",
     "size",
     "uuid",
     "icon",
     "tags",
     "tag_list",
     "details",
     "parent_id",
     "todo_date",
     "todo_state",
     "date_added",
     "date_modified",
     "content_modified",
     "stored_icon",
     "has_notes",
     "has_comments",
     "external",
     "external_id",
     "container",
     "content_type",
     "_uuid",
     "_unlisted",
     "site"
    ];

export function isContainer(node) {
    return node && CONTAINER_TYPES.some(t => t == node.type);
}

export function isEndpoint(node) {
    return node && ENDPOINT_TYPES.some(t => t == node.type);
}

export function isVirtualShelf(name) {
    name = name?.toLocaleUpperCase();
    return name === EVERYTHING.toLocaleUpperCase()
        || name === TODO_SHELF_NAME.toLocaleUpperCase()
        || name === DONE_SHELF_NAME.toLocaleUpperCase();
}

export function isBuiltInShelf(name) {
    name = name?.toLocaleUpperCase();
    return name === DEFAULT_SHELF_NAME.toLocaleUpperCase()
        || name === BROWSER_SHELF_NAME.toLocaleUpperCase()
        || name === CLOUD_SHELF_NAME.toLocaleUpperCase()
        || name === EVERYTHING.toLocaleUpperCase()
        || name === TODO_SHELF_NAME.toLocaleUpperCase()
        || name === DONE_SHELF_NAME.toLocaleUpperCase();
}

export function isNodeHasContent(node) {
    return node.type === NODE_TYPE_ARCHIVE || node.stored_icon || node.has_notes || node.has_comments;
}

export function byPosition(a, b) {
    let a_pos = a.pos === undefined? DEFAULT_POSITION: a.pos;
    let b_pos = b.pos === undefined? DEFAULT_POSITION: b.pos;
    return a_pos - b_pos;
}

export function byDateDesc(a, b) {
    if (a.date_added && b.date_added)
        return b.date_added - a.date_added;

    return 0;
}

export function byDateAsc(a, b) {
    if (a.date_added && b.date_added)
        return a.date_added - b.date_added;

    return 0;
}
