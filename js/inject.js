// EXAMPLE:
// new ScriptExecution(tab.id, frameId)
//     .executeScripts("js/jquery.js", "js/script.js")
//     .then(s => s.executeCodes('console.log("executes code...")'))
//     .then(s => s.injectCss("css/style.css"))
//     .then(s => console.log('done'));

function Injector(tabId, frameId) {
    this.frameId = frameId;
    this.tabId = tabId;
}
Injector.prototype.executeScripts = function(fileArray) {
    fileArray = Array.prototype.slice.call(arguments); // ES6: Array.from(arguments)
    return Promise.all(fileArray.map(file => exeScript(this.tabId, this.frameId, file))).then(() => this); // 'this' will be use at next chain
};
Injector.prototype.executeCodes = function(fileArray) {
    fileArray = Array.prototype.slice.call(arguments);
    return Promise.all(fileArray.map(code => exeCodes(this.tabId, this.frameId, code))).then(() => this);
};
Injector.prototype.injectCss = function(fileArray) {
    fileArray = Array.prototype.slice.call(arguments);
    return Promise.all(fileArray.map(file => exeCss(this.tabId, this.frameId, file))).then(() => this);
};
function promiseTo(fn, tabId, info) {
    return new Promise(resolve => {
        fn.call(chrome.tabs, tabId, info, x => resolve());
    });
}
function exeScript(tabId, frameId, path) {
    let info = { file : path, frameId, runAt: 'document_end' };
    return promiseTo(chrome.tabs.executeScript, tabId, info);
}
function exeCodes(tabId, frameId, code) {
    let info = { code : code, frameId, runAt: 'document_end' };
    return promiseTo(chrome.tabs.executeScript, tabId, info);
}
function exeCss(tabId, frameId, path) {
    let info = { file : path, frameId, runAt: 'document_end' };
    return promiseTo(chrome.tabs.insertCSS, tabId, info);
}
export {Injector};
