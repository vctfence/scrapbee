export async function readFile(file) {
    let reader = new FileReader();

    return new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);

        reader.readAsText(file);
    });
}

export function readBlob(blob, mode) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result);
        };
        reader.onerror = e => {
            reject(e);
        };

        if (mode === "binarystring")
            reader.readAsBinaryString(blob);
        else if (mode === "binary")
            reader.readAsArrayBuffer(blob);
        else
            reader.readAsText(blob, "utf-8");
    });
}

export class LineReader {
    /* options:
         chunk_size:          The chunk byte size. Default is 256K.
    */
    constructor(file, options) {
        this.file = file;
        this.offset = 0;
        this.fileSize = file.size;
        this.decoder = new TextDecoder();
        this.reader = new FileReader();

        this.chunkSize = !options || typeof options.chunk_size === 'undefined' ? 256 * 1024 : parseInt(options.chunk_size);
    }

    async* lines() {
        let remnantBytes;
        let remnantCharacters = "";

        for (let offset = 0; offset < this.fileSize; offset += this.chunkSize) {
            let chunk = await this.readChunk(offset);
            let bytes = new Uint8Array(chunk);
            let point = bytes.length - 1;
            let split = false;
            let remnant;

            if ((bytes[point] & 0b11000000) === 0b11000000)
                split = true;
            else {
                while (point && (bytes[point] & 0b11000000) === 0b10000000) {
                    point -= 1;
                }

                if (point !== bytes.length - 1)
                    split = true;
            }

            if (split) {
                remnant = bytes.slice(point);
                bytes = bytes.slice(0, point);

                if (remnantBytes) {
                    let newBytes = new Uint8Array(remnantBytes.length + bytes.length);
                    newBytes.set(remnantBytes);
                    newBytes.set(bytes, remnantBytes.length);
                    bytes = newBytes;
                }

                remnantBytes = remnant;
            }
            else {
                if (remnantBytes) {
                    let newBytes = new Uint8Array(remnantBytes.length + bytes.length);
                    newBytes.set(remnantBytes);
                    newBytes.set(bytes, remnantBytes.length);
                    bytes = newBytes;
                }

                remnantBytes = null;
            }

            let lines = this.decoder.decode(bytes).split("\n");

            if (lines.length === 1) {
                remnantCharacters = remnantCharacters + lines[0];
            }
            else if (lines.length) {
                if (remnantCharacters)
                    lines[0] = remnantCharacters + lines[0];

                remnantCharacters = lines[lines.length - 1];
                lines.length = lines.length - 1;

                yield* lines;
            }
        }

        yield remnantCharacters;
    }

    readChunk(offset) {
        return new Promise((resolve, reject) => {
            this.reader.onloadend = () => {
                resolve(this.reader.result);
            };
            this.reader.onerror = e => {
                reject(e);
            };

            this.reader.readAsArrayBuffer(this.file.slice(offset, offset + this.chunkSize));
        });
    }
}

export class LineStream {
    constructor(reader) {
        this._iterator = reader.lines();
    }

    async read() {
        const item = await this._iterator.next();
        if (item.done)
            return undefined;
        return item.value;
    }
}

export async function fetchText(url, init) {
    const response = await fetch(url, init);
    if (response.ok)
        return response.text();
}

export async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 10000 } = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);

    return response;
}
