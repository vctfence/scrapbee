import {settings} from "./settings.js";
import {BROWSER_EXTERNAL_TYPE, CLOUD_EXTERNAL_TYPE, RDF_EXTERNAL_TYPE} from "./storage.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud_shelf.js";
import {rdfBackend} from "./backend_rdf.js";
import {ishellBackend} from "./backend_ishell.js";
import {plugins} from "./bookmarks.js";
import {Bookmark} from "./bookmarks_bookmark.js";

export let systemInitialization = new Promise(async resolve => {
    await settings.load();

    Bookmark.configure();

    plugins.registerPlugin(BROWSER_EXTERNAL_TYPE, browserBackend);
    plugins.registerPlugin(CLOUD_EXTERNAL_TYPE, cloudBackend);
    plugins.registerPlugin(RDF_EXTERNAL_TYPE, rdfBackend);
    plugins.registerPlugin("ishell", ishellBackend);

    resolve(true);
});
