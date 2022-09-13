import {browserBackend} from "./backend_browser_shelf.js";
import {settings} from "./settings.js";
import {cloudBackend} from "./backend_cloud_shelf.js";
import {helperApp} from "./helper_app.js";
import {receive} from "./proxy.js";

receive.uiLockGet = message => {
    browserBackend.getUILock();
};

receive.uiLockRelease = message => {
    browserBackend.releaseUILock();
};

receive.memorizeUIBookmarks = message => {
    browserBackend.lockUIBookmarks(message.bookmarks, message.category);
}

receive.getListenerLockState = message => {
    return browserBackend.isLockedByListeners();
};

receive.reconcileBrowserBookmarkDb = async message => {
    await settings.load()
    browserBackend.reconcileBrowserBookmarksDB();
};

receive.reconcileCloudBookmarkDb = async message => {
    await settings.load();
    cloudBackend.reconcileCloudBookmarksDB(message.verbose);
};

receive.enableCloudBackgroundSync = async message => {
    cloudBackend.enableBackgroundSync(message.enable);
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

