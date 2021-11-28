import {STORAGE_FORMAT,} from "./storage.js";
import {parseJSONObject_v1, parseJSONObject_v2} from "./import_versions.js"
import {Marshaller, Unmarshaller} from "./marshaller.js";

export const SYNC_VERSION = 1; // sync v1 uses v3 JSON format
const FORMAT_VERSION = 3;

export class MarshallerJSON extends Marshaller {
    configure(options) {
        this._stream = options.stream;
    }

    async marshalMeta(options) {
        const {comment, uuid, objects, name} = options;
        const now = new Date();

        const meta = {
            export: STORAGE_FORMAT,
            version: FORMAT_VERSION,
            name: name,
            uuid: uuid,
            entities: objects.length,
            timestamp: now.getTime(),
            date: now.toISOString()
        };

        if (comment)
            meta.comment = comment;

        await this._stream.append(JSON.stringify(meta));
    }

    async marshal(object) {
        const content = await this.preprocessContent(object);
        const output = "\n" + JSON.stringify(content);
        return this._stream.append(output);
    }
}

export class StructuredUnmarshallerJSON extends Unmarshaller {
    configure(options) {
        this._stream = options.stream;
        this.parseJSONObjectImpl = JSON.parse;
    }

    async unmarshalMeta() {
        let metaLine = await this._stream.read();

        if (!metaLine)
            throw new Error("invalid file format");

        metaLine = metaLine.replace(/^\[/, "");
        metaLine = metaLine.replace(/,$/, "");
        const meta = JSON.parse(metaLine);

        if (!meta)
            throw new Error("invalid file format");

        if (meta.version > FORMAT_VERSION)
            throw new Error("export format version is not supported");

        switch (meta.version) {
            case 1:
                this.parseJSONObjectImpl = parseJSONObject_v1;
                break;
            case 2:
                this.parseJSONObjectImpl = parseJSONObject_v2;
                break;
        }

        return meta;
    }

    async unmarshal() {
        let input = await this._stream.read();

        if (input === "]") // support for the last line in old JSON format files
            input = undefined;

        if (input) {
            const object = this.parseJSONObjectImpl(input);
            object.persist = () => this.storeContent(object);
            return object;
        }
    }
}


