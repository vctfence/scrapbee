import {send} from "./proxy.js";
import {settings} from "./settings.js";

class IShellBackend {
    constructor() {
        this.ISHELL_ID = `ishell${this._isExtensionLocal()? "": "-we"}@gchristensen.github.io`;
    }

    initialize() {
        this.enableInvalidation(settings.ishell_presents());

        if (window.location.href.endsWith("background.html")) {
            let initListener = event => {
                if (event.data.type === "SCRAPYARD_ID_REQUESTED") {
                    if (event.data.sender.id === this.ISHELL_ID) {
                        this._listenIShell();
                        window.removeEventListener("message", initListener);
                    }
                }
            };
            window.addEventListener("message", initListener, false);
        }

        browser.runtime.onMessage.addListener((request) => {
            if (request.type === "ishellEnableInvalidation") {
                this.enableInvalidation(request.enable)
            }
        });
    }

    _listenIShell() {
        if (!this._initialized) {
            this._initialized = true;
            this.enableInvalidation(true);
            this._notifyOtherInstances(true);
            this._installManagementListeners();
        }
    }

    _installManagementListeners() {
        browser.management.onInstalled.addListener((info) => {
            if (info.id === this.ISHELL_ID) {
                this.enableInvalidation(true);
                this._notifyOtherInstances(true);
            }
        });

        browser.management.onUninstalled.addListener((info) => {
            if (info.id === this.ISHELL_ID) {
                this.enableInvalidation(false);
                this._notifyOtherInstances(false);
            }
        });
    }

    _notifyOtherInstances(enable) {
        settings.load().then(() => settings.ishell_presents(enable));
        // notify instances of the class in the other pages that extension is installed
        send.ishellEnableInvalidation({enable: enable});
    }

    _isExtensionLocal() {
        let id = browser.runtime.getManifest().applications?.gecko?.id;

        if (id)
            return !id.includes("-we");

        return false;
    }

    enableInvalidation(enable) {
        window.__iShellInvalidationEnabled = enable;
    }

    isInvalidationEnabled() {
        return window.__iShellInvalidationEnabled;
    }

    invalidateCompletion() {
        if (this.isInvalidationEnabled()) {
            try {
                browser.runtime.sendMessage(this.ISHELL_ID, {type: "SCRAPYARD_INVALIDATE_COMPLETION"});
            }
            catch (e) {
                console.error(e);
            }
        }
    }

    isIShell(id) {
        if (!id)
            return false;

        return /^ishell(:?-we)?@gchristensen.github.io$/.test(id);
    }
}

export let ishellBackend = new IShellBackend();
