const _MANIFEST = chrome.runtime.getManifest() // chrome.runtime should be used for compatibility

globalThis._MANIFEST_VERSION = _MANIFEST.manifest_version;

globalThis._MANIFEST_V3 = globalThis._MANIFEST_VERSION === 3;

globalThis._BACKGROUND_PAGE = !!_MANIFEST.background?.page;

if (typeof browser === "undefined")
    globalThis.browser = chrome;

globalThis.DEBUG = false;

globalThis.log = console.log

globalThis.logd = (...args) => globalThis.DEBUG? console.log.apply(console, args): undefined;

globalThis._tm = (name = "timer") => console.time(name);

globalThis._te = (name = "timer") => console.timeEnd(name);

globalThis._tr = () => console.trace();
