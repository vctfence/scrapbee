import {browserBackend} from "./backend_browser.js";
import {settings} from "./settings.js";
import {cloudBackend} from "./backend_cloud_shelf.js";
import {nativeBackend} from "./backend_native.js";
import {receive} from "./proxy.js";

receive.uiLockGet = message => {
    browserBackend.getUILock();
};

receive.uiLockRelease = message => {
    browserBackend.releaseUILock();
};

receive.memorizeUIBookmarks = message => {
    browserBackend.markUIBookmarks(message.bookmarks, message.category);
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

receive.helperAppGetVersion = async message => {
    await nativeBackend.probe();
    return nativeBackend.getVersion();
};

receive.helperAppHasVersion = async message => {
    return nativeBackend.hasVersion(message.version);
};


