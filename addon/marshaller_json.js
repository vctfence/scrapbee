import {parseJSONObject_v1, parseJSONObject_v2} from "./import_versions.js"
import {Marshaller, Unmarshaller} from "./marshaller.js";

export const SCRAPYARD_STORAGE_FORMAT = "Scrapyard";
const FORMAT_VERSION = 3;

export class MarshallerJSON extends Marshaller {
    configure(options) {
        this._stream = options.stream;
    }

    async marshalMeta(options) {
        const {comment, uuid, objects, name} = options;
        const now = new Date();

        const meta = {
            export: SCRAPYARD_STORAGE_FORMAT,
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
    constructor(meta) {
        super();

        this._meta = meta;
    }

    configure(options) {
        this._stream = options.stream;

        switch (this._meta.version) {
            case 1:
                this.parseJSONObjectImpl = parseJSONObject_v1;
                break;
            case 2:
                this.parseJSONObjectImpl = parseJSONObject_v2;
                break;
            default:
                this.parseJSONObjectImpl = JSON.parse;
                break;
        }
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


