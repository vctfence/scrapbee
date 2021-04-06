import UUID from "./lib/uuid.js"
import {settings} from "./settings.js"
import {showNotification} from "./utils.js"
import {backend} from "./backend.js";


class NativeBackend {
    constructor() {
        this.auth = UUID.numeric();
        this.version = undefined;
    }

    async getPort() {
        if (this.port) {
            return this.port;
        }
        else {
            this.port = new Promise(async (resolve, reject) => {
                let port = browser.runtime.connectNative("scrapyard_helper");
                port.onDisconnect.addListener((error) => {
                    resolve(null);
                    this.port = null;
                })

                let initListener = (response) => {
                    response = JSON.parse(response);
                    if (response.type === "INITIALIZED") {
                        port.onMessage.removeListener(initListener);
                        port.onMessage.addListener(NativeBackend.incomingMessages.bind(this))
                        resolve(port);
                        this.port = port;
                        this.version = response.version;
                    }
                }

                port.onMessage.addListener(initListener);

                settings.load(s => {
                    port.postMessage({
                        type: "INITIALIZE",
                        port: settings.helper_port_number(),
                        auth: this.auth
                    });
                });
            });

            return this.port;
        }
    }

    async probe(verbose = false) {
        const port = await this.getPort();
        if (!port && verbose)
            showNotification({message: "Can not connect to the helper application."})
        return !!port;
    }

    static async incomingMessages(msg) {
        msg = JSON.parse(msg);
        switch (msg.type) {
            case "REQUEST_PUSH_BLOB": {
                    const node = await backend.getNode(msg.uuid, true);
                    const blob = await backend.fetchBlob(node.id);
                    const port = await this.getPort();
                    port.postMessage({
                        type: "PUSH_BLOB",
                        uuid: node.uuid,
                        content_type: blob.type || "text/html",
                        blob: blob.data,
                        byte_length: blob.byte_length || null
                    })
                }
                break;
            case "REQUEST_RDF_PATH": {
                    const node = await backend.getNode(msg.uuid, true);
                    const port = await this.getPort();
                    let path = await backend.computePath(node.id);
                    let rdf_directory = path[0].uri;

                    port.postMessage({
                        type: "RDF_PATH",
                        uuid: node.uuid,
                        rdf_directory: `${rdf_directory}/data/${node.external_id}/`,
                    })
                }
                break;
            case "REQUEST_RDF_ROOT": {
                const node = await backend.getNode(msg.uuid, true);
                const port = await this.getPort();

                let path = await backend.computePath(node.id);
                let rdf_directory = path[0].uri;

                port.postMessage({
                    type: "RDF_ROOT",
                    uuid: node.uuid,
                    rdf_file: `${rdf_directory}/scrapbook.rdf`,
                })
            }
            break;
        }

    }

}

export let nativeBackend = new NativeBackend();
