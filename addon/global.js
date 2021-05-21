window.DEBUG = false;

window.log = (...args) => console.log.apply(console, args);

window.logd = (...args) => window.DEBUG? console.log.apply(console, args): undefined;

window._tm = (name = "timer") => console.time(name);

window._te = (name = "timer") => console.timeEnd(name);

window._tr = () => console.trace();
