import {ProgressCounter} from "./utils.js";
import {
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    EVERYTHING_SHELF_UUID,
    BROWSER_SHELF_ID,
    isContainerNode,
    NODE_TYPE_FOLDER,
    NODE_TYPE_SHELF
} from "./storage.js";
import {Folder} from "./bookmarks_folder.js";
import UUID from "./uuid.js";
import {formatShelfName} from "./bookmarking.js";
import {Import} from "./import.js";

export class StreamExporterBuilder {
    constructor(marshaller) {
        this._marshaller = marshaller;
        this._exportOptions = {};
    }

    setName(name) {
        this._exportOptions.name = name;
        return this;
    }

    setComment(comment) {
        this._exportOptions.comment = comment;
        return this;
    }

    setUUID(uuid) {
        this._exportOptions.uuid = uuid;
        return this;
    }

    setLinksOnly(linksOnly) {
        this._exportOptions.linksOnly = linksOnly;
        return this;
    }

    setStream(stream) {
        this._exportOptions.stream = stream;
        return this;
    }

    setObjects(objects) {
        this._exportOptions.objects = objects;
        return this;
    }

    setReportProgress(report) {
        this._exportOptions.progress = report;
        return this;
    }

    setMuteSidebar(mute) {
        this._exportOptions.muteSidebar = mute;
        return this;
    }

    setSidebarContext(val) {
        this._exportOptions.sidebarContext = val;
        return this;
    }

    _createExporter(options) {
        const exporter = new StreamExporter(this._marshaller);
        exporter._exportOptions = options;
        return exporter;
    }

    build() {
        this._marshaller?.configure(this._exportOptions);
        return this._createExporter(this._exportOptions);
    }
}

export class StreamExporter {
    constructor(marshaller) {
        this._marshaller = marshaller;
    }

    async export() {
        const {progress, muteSidebar, objects} = this._exportOptions;
        const marshaller = this._marshaller;

        await marshaller.marshalMeta(this._exportOptions);

        if (objects.length) {
            const local = !_BACKGROUND_PAGE && !muteSidebar;
            const progressCounter = progress
                ? new ProgressCounter(objects.length, "exportProgress", {muteSidebar}, local)
                : null;

            for (let object of objects) {
                await marshaller.marshal(object);
                progressCounter?.incrementAndNotify()
            }

            progressCounter?.finish();
        }
    }
}

export class StreamImporterBuilder {
    constructor(unmarshaller) {
        this._unmarshaller = unmarshaller;
        this._importOptions = {};
    }

    setName(name) {
        this._importOptions.name = name;
        return this;
    }

    setStream(stream) {
        this._importOptions.stream = stream;
        return this;
    }

    setReportProgress(report) {
        this._importOptions.progress = report;
        return this;
    }

    setMuteSidebar(mute) {
        this._importOptions.muteSidebar = mute;
        return this;
    }

    setSidebarContext(val) {
        this._importOptions.sidebarContext = val;
        return this;
    }

    _createImporter(options) {
        const importer = new StreamImporter(this._unmarshaller);
        importer._importOptions = options;
        return importer;
    }

    build() {
        this._unmarshaller?.configure(this._importOptions);
        return this._createImporter(this._importOptions);
    }
}

export class StreamImporter {
    constructor(unmarshaller) {
        this._unmarshaller = unmarshaller;
    }

    async import() {
        let {name: shelfName, progress, muteSidebar} = this._importOptions;
        const unmarshaller = this._unmarshaller;

        const meta = await unmarshaller.unmarshalMeta();

        await Import.prepare(shelfName);

        const local = !_BACKGROUND_PAGE && !muteSidebar;
        const progressCounter = progress && !!meta?.entities
            ? new ProgressCounter(meta.entities, "importProgress", {muteSidebar}, local)
            : null;

        while (await unmarshaller.unmarshal())
            progressCounter?.incrementAndNotify();

        progressCounter?.finish();
    }
}

export class StructuredStreamImporterBuilder extends StreamImporterBuilder {
    _createImporter(options) {
        const importer = new StructuredStreamImporter(this._unmarshaller);
        importer._importOptions = options;
        return importer;
    }
}

// Imports JSON Lines explicitly structured as a tree through id references
export class StructuredStreamImporter {
    constructor(unmarshaller) {
        this._unmarshaller = unmarshaller;
    }

    async import() {
        const unmarshaller = this._unmarshaller;
        const meta = await unmarshaller.unmarshalMeta();

        if (!meta)
            throw new Error("invalid file format");

        let firstObject = await unmarshaller.unmarshal();

        if (!firstObject)
            throw new Error("invalid file format");

        let {name: shelfName, progress, muteSidebar} = this._importOptions;

        await Import.prepare(shelfName);

        progress = progress && !!meta.entities;
        const local = !_BACKGROUND_PAGE && !muteSidebar;
        this._progressCounter = progress
            ? new ProgressCounter(meta.entities, "importProgress", {muteSidebar}, local)
            : null;

        this._importParentId2DBParentId = new Map();
        this._importParentId2DBParentId.set(DEFAULT_SHELF_ID, DEFAULT_SHELF_ID);
        this._everythingAsShelf = !firstObject.node.parent_id && shelfName !== EVERYTHING_SHELF_UUID;
        this._shelfNode = shelfName !== EVERYTHING_SHELF_UUID? await Folder.getOrCreateByPath(shelfName): null;

        if (this._shelfNode) // first object contains id of its parent shelf (not everything) if a shelf is imported
            this._importParentId2DBParentId.set(firstObject.node.parent_id, this._shelfNode.id);

        await this._importObject(firstObject);

        let object;
        while (object = await unmarshaller.unmarshal())
            await this._importObject(object);

        if (progress && !this._progressCounter.isFinished())
            throw new Error("some records are missing");
        else
            this._progressCounter?.finish();

        return this._shelfNode;
    }

    async _importObject(object) {
        const {_importParentId2DBParentId, _shelfNode, _everythingAsShelf, _progressCounter} = this;
        this._renameBuiltinShelves(object.node);

        // importing the default shelf
        if (object.node.type === NODE_TYPE_SHELF && object.node.name?.toLowerCase() === DEFAULT_SHELF_NAME) {
            if (_everythingAsShelf) // import default shelf as a folder
                object.node.uuid = UUID.numeric();
            else { // do not import default shelf because it is always there
                _progressCounter?.incrementAndNotify();
                return;
            }
        }

        if (object.node.parent_id)
            object.node.parent_id = _importParentId2DBParentId.get(object.node.parent_id);
        else if (_everythingAsShelf && object.node.type === NODE_TYPE_SHELF) {
            object.node.type = NODE_TYPE_FOLDER;
            object.node.parent_id = _shelfNode.id;
        }

        let objectImportId = object.node.id;
        const node = await object.persist();

        if (objectImportId && isContainerNode(node))
            _importParentId2DBParentId.set(objectImportId, node.id);

        _progressCounter?.incrementAndNotify();
    }

    _renameBuiltinShelves(node) {
        if (node && node.id === BROWSER_SHELF_ID)
            node.name = `${formatShelfName(node.name)} (imported)`;
    }
}
