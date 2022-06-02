import UUID from "./lib/uuid.js"
import {settings} from "./settings.js"
import {showNotification} from "./utils_browser.js";

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

                port.onDisconnect.addListener(error => {
                    resolve(null);
                    this.port = null;
                })

                let initListener = (response) => {
                    response = JSON.parse(response);
                    if (response.type === "INITIALIZED") {
                        port.onMessage.removeListener(initListener);
                        port.onMessage.addListener(NativeBackend.incomingMessages.bind(this))
                        this.port = port;
                        this.version = response.version;
                        resolve(port);
                    }
                }

                port.onMessage.addListener(initListener);

                await settings.load();

                try {
                    port.postMessage({
                        type: "INITIALIZE",
                        port: settings.helper_port_number(),
                        auth: this.auth
                    });
                }
                catch (e) {
                    //console.error(e, e.name)
                    resolve(null);
                    this.port = null;
                }
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

    getVersion() {
        if (this.port) {
            if (!this.version)
                return "0.1";
            return this.version;
        }
    }

    async hasVersion(version, msg) {
        if (!(await this.probe())) {
            if (msg)
                showNotification(msg);
            return false;
        }

        let installed = this.getVersion();

        if (installed) {
            if (installed.startsWith(version))
                return true;

            version = version.split(".").map(d => parseInt(d));
            installed = installed.split(".").map(d => parseInt(d));
            installed.length = version.length;

            for (let i = 0; i < version.length; ++i) {
                if (installed[i] > version[i])
                    return true;
            }

            if (msg)
                showNotification(msg);
            return false;
        }
    }

    static async incomingMessages(msg) {
        // msg = JSON.parse(msg);
        // switch (msg.type) {
        //
        // }
    }

    url(path) {
        return `http://localhost:${settings.helper_port_number()}${path}`;
    }

    _injectAuth(init) {
        init = init || {};
        init.headers = init.headers || {};
        init.headers["Authorization"] = "Basic " + btoa("default:" + this.auth);
        return init;
    }

    fetch(path, init) {
        init = this._injectAuth(init);
        return window.fetch(this.url(path), init);
    }

    async fetchText(path, init) {
        init = this._injectAuth(init);
        let response = await window.fetch(this.url(path), init);
        if (response.ok)
            return response.text();
    }

    async fetchJSON(path, init) {
        init = this._injectAuth(init);
        let response = await window.fetch(this.url(path), init);
        if (response.ok)
            return response.json();
    }

    async jsonPost(path, init) {
        let response = await this.post(path, init);
        if (!response.ok)
            console.log(await response.text())
        if (response.ok)
            return response.json();
    }

    async post(path, fields) {
        let form = new FormData();

        for (const [k, v] of Object.entries(fields))
            form.append(k, v + "");

        const init = this._injectAuth({method: "POST", body: form});

        return this.fetch(path, init);
    }

}

export let nativeBackend = new NativeBackend();
