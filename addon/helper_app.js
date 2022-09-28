import UUID from "./uuid.js"
import {settings} from "./settings.js"
import {CONTEXT_BACKGROUND, getContextType, hasCSRPermission, showNotification} from "./utils_browser.js";
import {send} from "./proxy.js"

export const HELPER_APP_v2_IS_REQUIRED = "Scrapyard helper application v2.0+ is required.";

class HelperApp {
    #auth;
    #externalEventHandlers = {};

    constructor() {
        this.auth = UUID.numeric();
        this.version = undefined;
    }

    get auth() {
        return this.#auth;
    }

    set auth(uuid) {
        this.#auth = uuid;
        this.authHeader = "Basic " + btoa("default:" + uuid);
    }

    async getPort() {
        if (this.port) {
            return this.port;
        }
        else {
            this.port = new Promise(async (resolve, reject) => {
                let port = browser.runtime.connectNative("scrapyard2_helper");

                port.onDisconnect.addListener(error => {
                    resolve(null);
                    this.port = null;
                })

                let initListener = async response => {
                    response = JSON.parse(response);
                    if (response.type === "INITIALIZED") {
                        port.onMessage.removeListener(initListener);

                        await this._onInitialized(response, port);

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

    async _onInitialized(msg, port) {
        this.port = port;
        this.version = msg.version;
        port.onMessage.addListener(HelperApp._incomingMessages.bind(this));

        if (msg.error === "address_in_use")
            showNotification(`The helper application HTTP port ${settings.helper_port_number()} is not available.`);
    }

    async probe(verbose) {
        if (getContextType() === CONTEXT_BACKGROUND)
            return this._probe(verbose);
        else
            return send.helperAppProbe({verbose});
    }

    async _probe(verbose = false) {
        if (!await hasCSRPermission())
            return false;

        const port = await this.getPort();

        if (!port && verbose)
            showNotification({message: "Can not connect to the helper application."})

        return !!port;
    }

    getVersion() {
        if (getContextType() !== CONTEXT_BACKGROUND)
            throw new Error("Can not call this method in the foreground context.");

        if (this.port) {
            if (!this.version)
                return "0.1";
            return this.version;
        }
    }

    async hasVersion(version, msg) {
        if (getContextType() === CONTEXT_BACKGROUND)
            return this._hasVersion(version, msg);
        else
            return send.helperAppHasVersion({version, alert: msg});
    }

    async _hasVersion(version, msg) {
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

    static async _incomingMessages(msg) {
        const port = await this.getPort();
        msg = JSON.parse(msg);

        const handler = this.#externalEventHandlers[msg.type];

        if (handler) {
            const response = await handler(msg);

            if (response !== undefined)
                port.postMessage(response);
        }
    }

    addMessageHandler(name, handler) {
        this.#externalEventHandlers[name] = handler;
    }

    url(path) {
        return `http://localhost:${settings.helper_port_number()}${path}`;
    }

    _injectAuth(init) {
        init = init || {};
        init.headers = init.headers || {};
        init.headers["Authorization"] = this.authHeader;
        return init;
    }

    async _handleHTTPError(response) {
        if (response.status === 204 || response.status === 404)
            return null;
        else {
            const errorMessage = `Scrapyard native client error ${response.status} (${response.statusText})\n`;
            console.error(errorMessage, await response.text());
            throw {httpError: {status: response.status, statusText: response.statusText}};
        }
    }

    fetch(path, init) {
        init = this._injectAuth(init);
        return globalThis.fetch(this.url(path), init);
    }

    async post(path, fields) {
        let form = new FormData();

        for (let [k, v] of Object.entries(fields)) {
            if (v instanceof Blob)
                form.append(k, v, k);
            else {
                v = v + "";
                form.append(k, v);
            }
        }

        const init = this._injectAuth({method: "POST", body: form});

        return this.fetch(path, init);
    }

    async postJSON(path, fields) {
        const init = this._injectAuth({
            method: "POST",
            body: JSON.stringify(fields),
            headers: {"content-type": "application/json"}
        });

        return this.fetch(path, init);
    }

    async fetchText(path, init) {
        init = this._injectAuth(init);
        let response = await globalThis.fetch(this.url(path), init);

        if (response.ok)
            return response.text();
        else
            return this._handleHTTPError(response);
    }

    async fetchJSON(path, init) {
        init = this._injectAuth(init);
        let response = await globalThis.fetch(this.url(path), init);

        if (response.ok)
            return response.json();
        else
            return this._handleHTTPError(response);
    }


    async fetchJSON_postJSON(path, fields) {
        let response = await this.postJSON(path, fields);

        if (response.ok)
            return response.json();
        else
            return this._handleHTTPError(response);
    }
}

export const helperApp = new HelperApp();

if (getContextType() !== CONTEXT_BACKGROUND) {
    send.helperAppGetBackgroundAuth().then(auth => helperApp.auth = auth);
}
