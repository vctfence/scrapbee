import {IconIDB} from "./storage_icon.js";
import {ArchiveIDB} from "./storage_archive.js";
import {NodeIDB} from "./storage_node.js";
import {CommentsIDB} from "./storage_comments.js";
import {NotesIDB} from "./storage_notes.js";

export const Node = NodeIDB.newInstance();
export const Archive = ArchiveIDB.newInstance();
export const Comments = CommentsIDB.newInstance();
export const Notes = NotesIDB.newInstance();
export const Icon = IconIDB.newInstance();

// export const Node = NodeIDB.newInstance_transition();
// export const Archive = ArchiveIDB.newInstance_transition();
// export const Comments = CommentsIDB.newInstance_transition();
// export const Notes = NotesIDB.newInstance_transition();
// export const Icon = IconIDB.newInstance_transition();
