import {settings} from "./settings.js";
import {BROWSER_EXTERNAL_TYPE, CLOUD_EXTERNAL_TYPE, RDF_EXTERNAL_TYPE} from "./storage.js";
import {browserShelf} from "./plugin_browser_shelf.js";
import {cloudShelfPlugin} from "./plugin_cloud_shelf.js";
import {rdfShelf} from "./plugin_rdf_shelf.js";
import {ishellPlugin} from "./plugin_ishell.js";
import {plugins} from "./bookmarks.js";
import {Bookmark} from "./bookmarks_bookmark.js";

export let systemInitialization = new Promise(async resolve => {
    await settings.load();

    Bookmark.configure();

    plugins.registerPlugin(BROWSER_EXTERNAL_TYPE, browserShelf);
    plugins.registerPlugin(CLOUD_EXTERNAL_TYPE, cloudShelfPlugin);
    plugins.registerPlugin(RDF_EXTERNAL_TYPE, rdfShelf);
    plugins.registerPlugin("ishell", ishellPlugin);

    resolve(true);
});
