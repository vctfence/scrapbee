import {settings} from "./settings.js";
import {BROWSER_EXTERNAL_TYPE, CLOUD_EXTERNAL_TYPE, FILES_EXTERNAL_TYPE, RDF_EXTERNAL_TYPE} from "./storage.js";
import {browserShelf} from "./plugin_browser_shelf.js";
import {cloudShelf} from "./plugin_cloud_shelf.js";
import {rdfShelf} from "./plugin_rdf_shelf.js";
import {ishellConnector} from "./plugin_ishell.js";
import {plugins} from "./bookmarks.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Folder} from "./bookmarks_folder.js";
import {filesShelf} from "./plugin_files_shelf.js";

export let systemInitialization = new Promise(async resolve => {
    await settings.load();

    Bookmark.configure();
    Folder.configure();

    plugins.registerPlugin(FILES_EXTERNAL_TYPE, filesShelf);
    plugins.registerPlugin(BROWSER_EXTERNAL_TYPE, browserShelf);
    plugins.registerPlugin(CLOUD_EXTERNAL_TYPE, cloudShelf);
    plugins.registerPlugin(RDF_EXTERNAL_TYPE, rdfShelf);
    plugins.registerPlugin("ishell", ishellConnector);

    resolve(true);
});
