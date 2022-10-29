import {IconIDB} from "./storage_icon.js";
import {ArchiveIDB} from "./storage_archive.js";
import {NodeIDB} from "./storage_node.js";
import {CommentsIDB} from "./storage_comments.js";
import {NotesIDB} from "./storage_notes.js";

export let Node = NodeIDB.newInstance();
export let Archive = ArchiveIDB.newInstance();
export let Comments = CommentsIDB.newInstance();
export let Notes = NotesIDB.newInstance();
export let Icon = IconIDB.newInstance();
