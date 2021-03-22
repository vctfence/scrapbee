import {settings} from "./settings.js";

class iShellBackend {
    constructor() {
        this.ISHELL_ID = `ishell${this._isExtensionLocal()? "": "-we"}@gchristensen.github.io`;
        settings.load(settings => this.enableInvalidation(settings.ishell_presents()));

        if (window.location.href.endsWith("background.html")) {
            let initListener = event => {
                if (event.data.type === "SCRAPYARD_ID_REQUESTED") {
                    if (event.data.sender.id === this.ISHELL_ID) {
                        this._initialize();
                        window.removeEventListener("message", initListener);
                    }
                }
            };
            window.addEventListener("message", initListener, false);
        }

        browser.runtime.onMessage.addListener((request) => {
            if (request.type === "ISHELL_ENABLE_INVALIDATION") {
                this.enableInvalidation(request.enable)
            }
        });
    }

    _initialize() {
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
        settings.load(settings => settings.ishell_presents(enable));
        // notify instances of the class in the other pages that extension is installed
        browser.runtime.sendMessage({type: "ISHELL_ENABLE_INVALIDATION", enable: enable});
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
            browser.runtime.sendMessage(this.ISHELL_ID, {type: "SCRAPYARD_INVALIDATE_COMPLETION"});
        }
    }
}

export let ishellBackend = new iShellBackend();
