import {send} from "./proxy.js";
import {settings} from "./settings.js";

class IShellBackend {
    initialize() {
        this.ISHELL_ID = `ishell${this._isExtensionLocal()? "": "-we"}@gchristensen.github.io`;
        this.enableInvalidation(settings.ishell_presents());

        if (globalThis.location.href.endsWith("background.html")) {
            let initListener = event => {
                if (event.data.type === "SCRAPYARD_ID_REQUESTED") {
                    if (event.data.sender.id === this.ISHELL_ID) {
                        this._listenIShell();
                        globalThis.removeEventListener("message", initListener);
                    }
                }
            };
            globalThis.addEventListener("message", initListener, false);
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
        let id = browser.runtime.id;

        if (id) {
            if (settings.platform.firefox)
                return !id.includes("-we");
            else
                return id === "fhgomkcfijbifanbkppjhgmcdkmbacep";
        }

        return false;
    }

    enableInvalidation(enable) {
        globalThis.__iShellInvalidationEnabled = enable;
    }

    isInvalidationEnabled() {
        return globalThis.__iShellInvalidationEnabled;
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
