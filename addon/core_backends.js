import {browserShelf} from "./plugin_browser_shelf.js";
import {settings} from "./settings.js";
import {cloudShelfPlugin} from "./plugin_cloud_shelf.js";
import {helperApp} from "./helper_app.js";
import {receive} from "./proxy.js";

receive.uiLockGet = message => {
    browserShelf.getUILock();
};

receive.uiLockRelease = message => {
    browserShelf.releaseUILock();
};

receive.memorizeUIBookmarks = message => {
    browserShelf.lockUIBookmarks(message.bookmarks, message.category);
}

receive.getListenerLockState = message => {
    return browserShelf.isLockedByListeners();
};

receive.reconcileBrowserBookmarkDb = async message => {
    await settings.load()
    browserShelf.reconcileBrowserBookmarksDB();
};

receive.reconcileCloudBookmarkDb = async message => {
    await settings.load();
    cloudShelfPlugin.reconcileCloudBookmarksDB(message.verbose);
};

receive.enableCloudBackgroundSync = async message => {
    cloudShelfPlugin.enableBackgroundSync(message.enable);
};

receive.helperAppProbe = message => {
    return helperApp.probe(message.verbose);
};

receive.helperAppGetVersion = async message => {
    await helperApp.probe();
    return helperApp.getVersion();
};

receive.helperAppHasVersion = async message => {
    return helperApp.hasVersion(message.version, message.alert);
};

receive.helperAppGetBackgroundAuth = message => {
    return helperApp.auth;
};

