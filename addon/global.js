window.DEBUG = false;

window.log = (...args) => console.log.apply(console, args);

window.logd = (...args) => window.DEBUG? console.log.apply(console, args): undefined;
