import {settings} from "./settings.js"

import {
    CLOUD_SHELF_ID,
    DEFAULT_SHELF_NAME,
    DONE_SHELF_NAME,
    EVERYTHING,
    FIREFOX_BOOKMARK_MOBILE,
    TODO_SHELF_NAME
} from "./storage.js";
import {Query} from "./storage_query.js";
import {ExportArea} from "./storage_export.js";
import {TODO} from "./bookmarks_todo.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {MarshallerJSON, StructuredUnmarshallerJSON} from "./marshaller_json.js";
import {MarshallerORG, UnmarshallerORG} from "./marshaller_org.js";
import {NetscapeImporterBuilder} from "./import_html.js";
import {RDFImporterBuilder} from "./import_rdf.js";
import {StreamExporterBuilder, StreamImporterBuilder, StructuredStreamImporterBuilder} from "./import_drivers.js";
import {importTransaction} from "./import_transaction.js";

export class Export {
    static create(format) {
        switch (format) {
            case "json":
                return new StreamExporterBuilder(new MarshallerJSON());
            case "org":
                return new StreamExporterBuilder(new MarshallerORG());
        }
    }

    // get nodes of the specified shelf for export
    static async nodes(shelf, computeLevel) {
        const isShelfName = typeof shelf === "string";
        let nodes;

        if (isShelfName && shelf.toUpperCase() === TODO_SHELF_NAME) {
            nodes = await TODO.listTODO();
            if (computeLevel)
                nodes.forEach(n => n.__level = 1)
            return nodes;
        }
        else if (isShelfName && shelf.toUpperCase() === DONE_SHELF_NAME) {
            nodes = await TODO.listDONE();
            if (computeLevel)
                nodes.forEach(n => n.__level = 1)
            return nodes;
        }

        const everything = isShelfName && shelf === EVERYTHING;

        if (!everything && isShelfName)
            shelf = await Query.shelf(shelf);

        let level = computeLevel? (everything? 1: 0): undefined;

        if (everything) {
            const shelves = await Query.allShelves();
            const cloud = shelves.find(s => s.id === CLOUD_SHELF_ID);
            if (cloud)
                shelves.splice(shelves.indexOf(cloud), 1);
            nodes = await Query.fullSubtree(shelves.map(s => s.id), true, level);
        }
        else {
            nodes = await Query.fullSubtree(shelf.id,true, level);
            nodes.shift();
        }

        const mobileBookmarks = nodes.find(n => n.external_id === FIREFOX_BOOKMARK_MOBILE);
        if (mobileBookmarks) {
            const mobileSubtree = nodes.filter(n => n.parent_id === mobileBookmarks.id);
            for (const n of mobileSubtree)
                nodes.splice(nodes.indexOf(n), 1);
            nodes.splice(nodes.indexOf(mobileBookmarks), 1);
        }

        return nodes;
    }
}

export class Import {
    static create(format) {
        switch (format) {
            case "json":
            case "jsonl":
                return new StructuredStreamImporterBuilder(new StructuredUnmarshallerJSON());
            case "org":
                return new StreamImporterBuilder(new UnmarshallerORG());
            case "html":
                return new NetscapeImporterBuilder(null);
            case "rdf":
                return new RDFImporterBuilder(null);
        }
    }

    static async prepare(shelf) {
        if (settings.undo_failed_imports())
            return;

        if (shelf === EVERYTHING) {
            return ExportArea.prepareToImportEverything();
        }
        else {
            shelf = await Query.shelf(shelf);

            if (shelf && shelf.name === DEFAULT_SHELF_NAME) {
                return Bookmark.deleteChildren(shelf.id);
            } else if (shelf) {
                return Bookmark.delete(shelf.id);
            }
        }
    }

    static async transaction(shelf, importer) {
        return importTransaction(shelf, importer);
    }
}



