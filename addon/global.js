window._MANIFEST_VERSION = browser.runtime.getManifest().manifest_version;

window._MANIFEST_V3 = window._MANIFEST_VERSION === 3;

window.DEBUG = false;

window.log = (...args) => console.log.apply(console, args);

window.logd = (...args) => window.DEBUG? console.log.apply(console, args): undefined;

window._tm = (name = "timer") => console.time(name);

window._te = (name = "timer") => console.timeEnd(name);

window._tr = () => console.trace();
