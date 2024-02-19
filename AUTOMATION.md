## Automation

Automation is a powerful feature that allows to programmatically create, modify, and delete Scrapyard bookmarks
from [iShell](https://gchristensen.github.io/ishell/) commands or your own extensions. For example, with this API you
can import hierarchical content, manage TODO lists, or create something similar to the legacy Firefox "Live Bookmarks".

All automation features are implemented through the WebExtensions
[runtime messaging API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage).
The ES6 module available by [this](https://raw.githubusercontent.com/GChristensen/ishell/master/addon/api/scrapyard.js) link provides a
JavaScript wrapper which is used in the examples below.

To call Scrapyard API from regular extensions, automation should be enabled manually at the Scrapyard advanced settings
page (**ext+scrapyard://advanced**). It is not necessary to enable automation to use the code below from iShell commands.

The following messages are currently available:

#### SCRAPYARD_GET_VERSION

Returns Scrapyard version. Useful for testing if Scrapyard presents in the browser:

```javascript
import {getVersion} from "./scrapyard.js";

try {
    let version = await getVersion();
    console.log(`Scrapyard version: ${version}`);
}
catch (e) {
    сonsole.log("Scrapyard is not installed or automation is disabled");
}
```

#### SCRAPYARD_OPEN_BATCH_SESSION, SCRAPYARD_CLOSE_BATCH_SESSION

To optimize disk operations on the Scrapyard storage, these messages need to be issued
when creating or modifying multiple bookmark or archive items.

```javascript
import {openBatchSession, closeBatchSession} from "./scrapyard.js";

try {
    await openBatchSession();

    // Procesing...
}
finally {
    await closeBatchSession();
}
```

#### SCRAPYARD_ADD_BOOKMARK

Creates a bookmark.

```js
import {addBookmark} from "./scrapyard.js";

const uuid = await addBookmark({
    url:        "http://example.com",             // Bookmark URL
    title:      "Bookmark Title",                 // Bookmark title
    icon:       "http://example.com/favicon.ico", // URL of bookmark favicon
    path:       "shelf/my/directory",             // Bookmark shelf and directory
    tags:       "comma, separated",               // List of bookmark tags
    details:    "Bookmark details",               // Bookmark details
    todo_state: "TODO",                           // One of the following strings:
                                                  // TODO, WAITING, POSTPONED, DONE, CANCELLED
    todo_date:  "YYYY-MM-DD",                     // TODO expiration date
    comments:   "comment text",                   // Bookmark comments
    container:  "firefox-container-1",            // cookieStoreId of a Firefox Multi-Account container
    select:     true                              // Select the newly created bookmark in the interface
});
```

All parameters are optional. Directories in the bookmark path will be created automatically, if not exist.
The relevant undefined parameters (`url`, `title`, `icon`) will be captured from the active tab.

The icon URL is used by Scrapyard only to store its image in the database, so it may be a URL from a local server, or a
[data-URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs).
If this parameter is explicitly set to an empty string, the default icon will be
used.

If `title` or `icon` parameters are explicitly set to `true`, bookmark title or icon will be extracted from the page
defined by the `url` parameter.

Returns UUID of the newly created bookmark.

Note: if you have [Python](https://www.python.org) installed, a local server could be started by
executing `python3 -m http.server` in the desired directory.

#### SCRAPYARD_ADD_ARCHIVE

Creates an archive.

```js
import {addArchive} from "./scrapyard.js";

const uuid = await addArchive({
    url:          "http://example.com",             // Bookmark URL
    title:        "Bookmark Title",                 // Bookmark title
    icon:         "http://example.com/favicon.ico", // URL of bookmark favicon
    path:         "shelf/my/directory",             // Bookmark shelf and directory
    tags:         "comma, separated",               // List of bookmark tags
    details:      "Bookmark details",               // Bookmark details
    todo_state:   "TODO",                           // One of the following strings:
                                                    // TODO, WAITING, POSTPONED, DONE, CANCELLED
    todo_date:    "YYYY-MM-DD",                     // TODO expiration date
    comments:     "comment text",                   // Bookmark comments
    container:    "firefox-container-1",            // cookieStoreId of a Firefox Multi-Account container
    content:      "<p>Archive content</p>",         // A String or ArrayBuffer, representing the text or bytes of the archived content
                                                    // HTML-pages, images, PDF-documents, and other files could be stored
    content_type: "text/html",                      // MIME-type of the stored content
    pack:         true,                             // Pakck and store the page specified by the 'url' parameter,
                                                    // the 'content' parameter is ignored
    local:        true,                             // The 'url' parameter contains path to a local file, 'pack' is ignored
    hide_tab:     false,                            // Hide tab necessary to pack the page
    select:       true                              // Select the newly created bookmark in the interface
});
```

All parameters are optional. Directories in the bookmark path will be created automatically, if not exist.
The relevant missing parameters (`url`, `title`, `icon`, `content`, `content_type`) will be captured
from the active tab. If the `url` parameter is explicitly set to an empty string,
it will remain empty.

If `title` or `icon` parameters are explicitly set to `true`, bookmark title or icon will be extracted from the page
defined by the `url` parameter.

When the `pack` parameter is specified, this API ignores the `content`, `title`, and `icon` parameters,
and packs, then stores the page defined by the `url` parameter. "text/html" content type is assumed.
A new tab is created, which is required for page packing. This tab could be hidden through the `hide_tab` message option.

The `pack` and `content` parameters are ignored if the `local` parameter is set to `true`. In this case, the addon will perform
packing of the HTML content as the `pack` option, or store binary content otherwise. The `title` and `icon` parameters are
taken into account.

If the `pack` or `local` parameters are set, bookmark icon and title will be assigned automatically.

Returns UUID of the newly created archive.

#### SCRAPYARD_ADD_NOTES

Creates notes.

```js
import {addNotes} from "./scrapyard.js";

const uuid = await addNotes({
    title:        "Bookmark Title",                 // Bookmark title
    path:         "shelf/my/directory",             // Bookmark shelf and directory
    tags:         "comma, separated",               // List of bookmark tags
    details:      "Bookmark details",               // Bookmark details
    todo_state:   "TODO",                           // One of the following strings:
                                                    // TODO, WAITING, POSTPONED, DONE, CANCELLED
    todo_date:    "YYYY-MM-DD",                     // TODO expiration date
    comments:     "comment text",                   // Bookmark comments
    content:      "Notes content",                  // A string
    format:       "text",                           // One of the following strings: text, markdown, org
    select:       true                              // Select the newly created bookmark in the interface
});
```

Returns UUID of the newly created notes.

#### SCRAPYARD_ADD_SEPARATOR

Creates separator.

```js
import {addSeparator} from "./scrapyard.js";

const uuid = await addSeparator({
    path:         "shelf/my/directory",             // Separator shelf and directory
    select:       true                              // Select the newly created bookmark in the interface
});
```

Returns UUID of the newly created separator.

#### SCRAPYARD_PACK_PAGE

Packs content of all resources (images, CSS, etc.) referenced by a web-page into a single HTML string.
When displayed in the browser, such a page will not rely on any external dependencies.
Use this API, for example, when it is necessary to somehow modify the captured page.

This API creates a new tab which is required for its operation.
This tab could be hidden through the `hide_tab` message option.

```js
import {packPage} from "./scrapyard.js";

const {html, title, icon} = await packPage({
    url:      "http://example.com",  // URL of the page to be packed
    local:    true,                  // The 'url' parameter contains path to a local file
    hide_tab: false                  // Hide the tab used by the API
});
```

Returns an object with the following properties:

* html - HTML string with the content of the specified page and all its referenced resources.
* title - title of the captured page.
* icon - page favicon URL.

#### SCRAPYARD_GET_UUID

Retrieves the properties of a bookmark or archive defined by the `uuid` parameter.

```js
import {getItem} from "./scrapyard.js";

const item = await getItem({
    uuid: "F0D858C6ED40416AA402EB2C3257EA17"
});
```

Returns an object with the following properties:

* type
* uuid
* title
* url
* icon
* tags
* details
* todo_state
* todo_date
* comments
* container
* path

Only `type`, `uuid`, and `title` properties are always present.

#### SCRAPYARD_GET_UUID_CONTENT

Retrieves the content of an archive or notes defined by the `uuid` parameter.

```js
import {getItemContent} from "./scrapyard.js";

const item = await getItemContent({
    uuid: "F0D858C6ED40416AA402EB2C3257EA17"
});
```

Returns an object with the following properties:

* content - content of the archive or notes, may be a string or array-buffer.
* content_type - content MIME-type.
* contains - may be one of the following strings: text, bytes, files.
* format - format of the notes.

Only content property is always present. The type of the content depends on the value of the `contains` property.
When `contains` is equal to "files", `content` property contains an array-buffer with the bytes of a ZIP-archive.

#### SCRAPYARD_GET_SELECTION

Retrieves the properties of bookmarks selected in the Scrapyard sidebar.

```js
import {getSelection} from "./scrapyard.js";

const items = await getSelection();
```

#### SCRAPYARD_LIST_UUID, SCRAPYARD_LIST_PATH

Lists the direct descendants of a shelf or folder defined by the `uuid` or `path` parameter.

```js
import {listItems} from "./scrapyard.js";

const items = await listItems({
    uuid: null,  // the uuid and path parameters are mutually exclusive
    path: "/"
});
```

If `null` is specified as the value of the `uuid` parameter, the list of all shelves is returned.

#### SCRAPYARD_UPDATE_UUID

Updates the properties of a bookmark, archive, or folder represented by the given UUID.

```js
import {updateItem} from "./scrapyard.js";

await updateItem({
    uuid:       "F0D858C6ED40416AA402EB2C3257EA17",
    title:      "Bookmark Title",                 // Bookmark title
    url:        "http://example.com",             // Bookmark URL
    icon:       "http://example.com/favicon.ico", // URL of bookmark favicon
    tags:       "comma, separated",               // List of bookmark tags
    details:    "Bookmark details",               // Bookmark details
    todo_state: "TODO",                           // One of the following strings:
                                                  // TODO, WAITING, POSTPONED, DONE, CANCELLED
    todo_date:  "YYYY-MM-DD",                     // TODO expiration date
    comments:   "comment text",                   // Bookmark comments
    container:  "firefox-container-1",            // cookieStoreId of a Firefox Multi-Account container
    refresh:    true                              // Refresh the sidebar
});
```

All parameters are optional. If the `icon` parameter is explicitly set to an empty string, the default icon will be used.
It is preferable to use the `refresh` parameter only on the last invocation in the chain of updates.

#### SCRAPYARD_REMOVE_UUID

Removes a bookmark or archive defined by the given UUID.

```js
import {deleteItem} from "./scrapyard.js";

const items = await deleteItem({
    uuid:    "F0D858C6ED40416AA402EB2C3257EA17",
    refresh: true                                  // Refresh the sidebar
});
```

It is preferable to use the `refresh` parameter only on the last invocation in the chain of updates.

#### SCRAPYARD_BROWSE_UUID

Opens a bookmark or archive defined by the UUID, which could be found at the bookmark property dialog.

```js
import {browseItem} from "./scrapyard.js";

await browseItem({
    uuid: "F0D858C6ED40416AA402EB2C3257EA17"
});
```

### Examples

In the following examples we use iShell commands to interact with Scrapyard. With iShell, there is no need to
create separate add-ons for the Scrapyard automation in the most cases. See the iShell
[tutorial](https://gchristensen.github.io/ishell/addon/ui/options/tutorial.html) for more details on command authoring.

#### Uploading Local Files to Scrapyard

In the following example, we create a command that stores a local file
in Scrapyard under the folder specified by the `to` argument.

In iShell, the global object `cmdAPI.scrapyard` provides the same methods as the ES6 wrapper referenced above, so
there is no need to import anything.

```javascript
/**
    Being placed in the iShell command editor, this code
    creates the command named "upload-file".

    # Syntax
    **upload-file** _file path_ **to** _folder path_

    # Arguments
    - _file path_ - a local file path
    - _folder path_ - a full path of a folder in Scrapyard

    # Examples
    **upload-file** *d:/documents/my file.pdf* **to** *papers/misc*

    @command
    @markdown
    @icon /ui/icons/scrapyard.svg
    @description Stores a local file under the specified Scrapyard folder.
    @uuid 674BF919-3BCA-4378-AB8F-C873F8CFE42A
 */
class UploadFile {
    constructor(args) {
        args[OBJECT] = {nountype: noun_arb_text, label: "path"};
        // cmdAPI.scrapyard.noun_type_directory provides the list of all Scrapyard directories
        // to autocompletion. A precaution is taken in the case of missing Scrapyard add-on.
        const directory_noun = cmdAPI.scrapyard?.noun_type_directory || {suggest: () => ({})};
        args[TO] = {nountype: directory_noun, label: "directory"};
    }

    preview({OBJECT, TO}, display) {
        display.text(`Upload file <b>${OBJECT?.text}</b> to the <b>${AT?.text}</b> folder in Scrapyard.`);
    }

    async execute({OBJECT, TO}) {
        if (!OBJECT?.text)
            return;

        const localPath = OBJECT.text;

        let title = localPath.replaceAll("\\", "/").split("/");
        title = title[title.length - 1]; // use file name as the default bookmark title

        cmdAPI.scrapyard.addArchive({
            title:   title,
            url:     localPath,
            path:    TO?.text,
            local:   true,
            select:  true
        });
    }
}
```

Command example:

**upload-file** *d:/documents/my file.pdf* **to** *papers/misc*

#### Processing Archives with Python

The iShell command demonstrated below sends the content of the currently selected archives for processing in
the iShell backend application written in Python. There you can develop your own [Flask](https://flask.palletsprojects.com/)
handlers.

```javascript
/**
    This command has no arguments.

    @command
    @icon /ui/icons/scrapyard.svg
    @description Process with Python the curretnly selected Scrapyard archives.
    @uuid 37B60EBB-F216-4A36-88DA-4703579A6457
*/
class ConvertToMarkdown {
    async execute() {
        const items = await cmdAPI.scrapyard.getSelection();

        for (const item of items) {
            if (item.type === "archive") {
                try {
                    const content = await cmdAPI.scrapyard.getItemContent({uuid: item.uuid});
                    const doc = cmdAPI.parseHtml(content.content);

                    $("style, script", doc).remove();
                    content.content = doc.outerHTML;

                    const payload = JSON.stringify({item, content});
                    const headers = {"content-type": "application/json"};

                    await cmdAPI.backendFetch("/convert_to_markdown", {method: "post", body: payload, headers});
                } catch (e) {
                    console.error(e);
                }
            }
        }

    }
}
```

The Flask handler:

```python
import markdownify # 3-rd party library
from flask import request

@app.route("/convert_to_markdown", methods=['POST'])
def convert_to_markdown():
    title, content = request.json["item"]["title"], request.json["content"]["content"]
    markdown = markdownify.markdownify(content)

    with open(f"d:/markdown/{title}.md", "w", encoding="utf-8") as file:
        file.write(markdown)

    return "", 204
```
