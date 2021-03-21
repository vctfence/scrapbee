import {settings} from "./settings.js";

class iShellBackend {
    constructor() {
        this.ISHELL_ID = `ishell${this._isExtensionLocal()? "": "-we"}@gchristensen.github.io`;
        this._invalidationEnabled = true;

        // settings.load(settings => this._invalidationEnabled = settings.ishell_presents());
        //
        // browser.runtime.onMessage.addListener((request) => {
        //     if (request.type === "ISHELL_ENABLE_INVALIDATION") {
        //         this.enableInvalidation(request.enable)
        //     }
        // });
    }

    async initialize(settings) {
        // try {
        //     let version = await browser.runtime.sendMessage(this.ISHELL_ID, {type: "SCRAPYARD_ISHELL_GET_VERSION"});
        //     let ishell_presents = !!version;
        //     settings.ishell_presents(ishell_presents);
        //     this.enableInvalidation(ishell_presents);
        // }
        // catch (e) {
        //     settings.ishell_presents(false);
        //     this.enableInvalidation(false);
        // }
        // this.installManagementListeners();
    }

    installManagementListeners() {
        // browser.management.onInstalled.addListener((info) => {
        //     if (info.id === this.ISHELL_ID) {
        //         settings.ishell_presents(true);
        //         this.enableInvalidation(true);
        //         // notify instances of the class in the other pages that extension is installed
        //         browser.runtime.sendMessage({type: "ISHELL_ENABLE_INVALIDATION", enable: true});
        //     }
        // });
        //
        // browser.management.onUninstalled.addListener((info) => {
        //     if (info.id === this.ISHELL_ID) {
        //         settings.ishell_presents(false);
        //         this.enableInvalidation(false);
        //         browser.runtime.sendMessage({type: "ISHELL_ENABLE_INVALIDATION", enable: false});
        //     }
        // });
    }

    _isExtensionLocal() {
        let id = browser.runtime.getManifest().applications?.gecko?.id;

        if (id)
            return !id.includes("-we");

        return false;
    }

    enableInvalidation(enable) {
        this._invalidationEnabled = enable;
    }

    isInvalidationEnabled() {
        return this._invalidationEnabled;
    }

    invalidateCompletion() {
        if (this._invalidationEnabled) {
            browser.runtime.sendMessage(this.ISHELL_ID, {type: "SCRAPYARD_INVALIDATE_COMPLETION"});
        }
    }
}

export let ishellBackend = new iShellBackend();
