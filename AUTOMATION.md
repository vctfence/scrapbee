## Automation

Automation is a powerful feature that allows to programmatically create, modify, and delete Scrapyard bookmarks
from [iShell](https://gchristensen.github.io/ishell/) commands or your own extensions. For example, with this API you
can import hierarchical content, manage TODO lists, or create something similar to the former Firefox "Live Bookmarks".

Currently, automation is experimental, and should be manually enabled from the Scrapyard advanced settings page:
**ext+scrapyard://advanced**
<br>
Because Scrapyard knows about iShell, you do not need to enable automation to use the code below from iShell commands.

All automation features are implemented through the WebExtensions
[runtime messaging API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage).
The following messages are currently available:

#### SCRAPYARD_GET_VERSION

Returns Scrapyard version. Useful for testing if Scrapyard presents in the browser:

```javascript
try {
    let version = await browser.runtime.sendMessage("scrapyard-we@firefox", {
        type: "SCRAPYARD_GET_VERSION"
    });

    console.log(`Scrapyard version: ${version}`);
}
catch (e) {
    сonsole.log("Scrapyard is not installed or automation is disabled");
}
```

#### SCRAPYARD_ADD_BOOKMARK

Creates a bookmark in Scrapyard.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:       "SCRAPYARD_ADD_BOOKMARK",
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
    select:     true                              // Select the bookmark in the interface
});
```

All parameters are optional. Directories in the bookmark path will be created automatically, if not exist.
The relevant missing parameters (`url`, `title`, `icon`) will be captured from the active tab. In this and the
following API the icon URL is used by Scrapyard only to store its image in the database, so it may be a URL from a
local server, or a [data-URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs).
If this parameter is explicitly set to an empty string, the default icon will be used.

If `title` or `icon` parameters are explicitly set to `true`, bookmark title or icon will be extracted from the page
defined by the `url` parameter.

Returns UUID of the newly created bookmark.

Note: if you have [Python](https://www.python.org) installed, a local server could be started simply by
executing `python3 -m http.server` in the desired directory.

#### SCRAPYARD_ADD_ARCHIVE

Creates an archive in Scrapyard.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:         "SCRAPYARD_ADD_ARCHIVE",
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
                                                    // do not use the 'content' parameter
    local:        true,                             // The 'url' parameter contains path to a local file
                                                    // (helper application v0.4+ is required to capture local files)
    hide_tab:     false,                            // Hide tab necessary to pack the page
    select:       true                              // Select the bookmark in the interface
});
```

All parameters are optional. Directories in the bookmark path will be created automatically, if not exist.
The relevant missing parameters (`url`, `title`, `icon`, `content`, `content_type`) will be captured
from the active tab. If the `url` parameter is explicitly set to an empty string,
it will remain empty.

When the `pack` parameter is specified, this API ignores the `content`, `title`, and `icon` parameters,
and packs, then stores the page defined by the `url` parameter. "text/html" content type is assumed.
A new tab is created, which is required for page packing (see the API below).
This tab could be hidden through the `hide_tab` message option. Although this option may be useful
in the case of mass API calls, please be careful with it, since Firefox may complain about hidden
tabs and offer to remove the addon.

The `pack` and `content` parameters are ignored if the `local` parameter is set to `true`. The addon will perform
packing of the HTML content as the `pack` option, or store binary content otherwise. The `title` and `icon` parameters are
taken into account.

If the `pack` or `local` parameters are used, bookmark icon and title will be set automatically in the case of HTML content.

Returns UUID of the newly created archive.

#### SCRAPYARD_PACK_PAGE

Packs content of all resources (images, CSS, etc.) referenced by a web-page into a single HTML string.
When displayed in the browser, such a page will not rely on any external dependencies
and could be served from a database.
Use this API, for example, when you need to somehow modify the captured page.

This API creates a new tab which is required for its operation and closes it on completion.
This tab could be hidden through the `hide_tab` message option. Although this option may be useful
in the case of mass API calls, please be careful with it, since Firefox may complain about hidden
tabs and offer to remove the addon.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:     "SCRAPYARD_PACK_PAGE",
    url:      "http://example.com",  // URL of the page to be packed
    local:    true,                  // The 'url' parameter contains path to a local file
                                     // (helper application v0.4+ is required to capture local files)
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
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type: "SCRAPYARD_GET_UUID",
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

Only `type`, `uuid`, and `title` properties are always present.

#### SCRAPYARD_LIST_UUID

Lists the direct descendants of a shelf or folder defined by the `uuid` parameter
in the same format as `SCRAPYARD_GET_UUID`.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type: "SCRAPYARD_LIST_UUID",
    uuid: null
});
```

If `null` is specified as the value of the `uuid` parameter, the list of all existing shelves is returned.

#### SCRAPYARD_LIST_PATH

Lists the direct descendants of a shelf or folder defined by the `path` parameter
in the same format as `SCRAPYARD_GET_UUID`.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type: "SCRAPYARD_LIST_PATH",
    path: "/"
});
```

If `/` is specified as the value of the `path` parameter, the list of all existing shelves is returned.

#### SCRAPYARD_UPDATE_UUID

Updates the properties of a bookmark, archive, or folder represented by the given UUID.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:       "SCRAPYARD_UPDATE_UUID",
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
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:    "SCRAPYARD_REMOVE_UUID",
    uuid:    "F0D858C6ED40416AA402EB2C3257EA17",
    refresh: true                                  // Refresh the sidebar
});
```

It is preferable to use the `refresh` parameter only on the last invocation in the chain of updates.

#### SCRAPYARD_BROWSE_UUID

Opens a bookmark or archive defined by the UUID, which could be
found at the bookmark property dialog.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type: "SCRAPYARD_BROWSE_UUID",
    uuid: "F0D858C6ED40416AA402EB2C3257EA17"
});
```

### Examples

#### Creating Dedicated iShell Bookmark Commands

You can quickly open dedicated bookmarks by iShell commands without using mouse. This may
be helpful in the case of bookmarks with assigned multi-account containers. The example below
demonstrates a command without arguments used to open a single bookmark defined by its UUID.

```js
/**
    Being placed in the iShell command editor, this code
    creates a command named "my-twitter", which opens
    a single bookmark defined by its UUID.

    @description Opens my twitter account in a personal container
    @command
*/
class MyTwitter {
    execute() {
        browser.runtime.sendMessage("scrapyard-we@firefox", {
            type: "SCRAPYARD_BROWSE_UUID",
            uuid: "F0D858C6ED40416AA402EB2C3257EA17"
        });
    }
}
```

It is possible to create more complex commands with arguments corresponding to the bookmarks you want to open.
The following example creates a command named **my-site** which can be called with either
*personal* or *work* argument values.

```js
/**
    This command (my-site) has an argument that allows to open
    a site in a work or a personal context. The corresponding
    containers should be assigned to the bookmarks in Scrapyard.

    @command
    @description Opens my site in different contexts
*/
class MySite {
    constructor(args) {
        const sites = {"personal": "589421A3D93941B4BAD4A2DEE8FF5297",
                       "work":     "6C53355203D94BC59996E21D15C86C3E"};
        args[OBJECT] = {nountype: sites, label: "site"};
    }

    preview({OBJECT}, display) {
        display.text("Opens my site in " + OBJECT?.text + " context.");
    }

    execute({OBJECT}) {
        browser.runtime.sendMessage("scrapyard-we@firefox", {
            type: "SCRAPYARD_BROWSE_UUID",
            uuid: OBJECT?.data
        });
    }
}
```

The following function allows to create such commands with one line of code:

```js
/**
    This class is used to dynamically create iShell commands

    @command
    @metaclass
    @description Opens a bookmark
*/
class BrowseBookmarkCommand {
    metaconstructor(name, uuid) {
        this.name = name;

        if (typeof uuid === "object")
            this.arguments = [{role: "object", nountype: uuid, label: "site"}];
        else
            this._uuid = uuid;
    }

    preview({OBJECT}, display) {
        this.previewDefault(display);
    }

    execute({OBJECT}) {
        browser.runtime.sendMessage("scrapyard-we@firefox", {
            type: "SCRAPYARD_BROWSE_UUID",
            uuid: this._uuid || OBJECT?.data
        });
    }
}

function createBookmarkCommand(name, uuid) {
    cmdAPI.createCommand(new BrowseBookmarkCommand(name, uuid))
}

// Now bookmarking commands could be created with a single function call:

createBookmarkCommand("my-twitter", "F0D858C6ED40416AA402EB2C3257EA17");
createBookmarkCommand("my-site", {"personal": "589421A3D93941B4BAD4A2DEE8FF5297",
                                  "work":     "6C53355203D94BC59996E21D15C86C3E"});

```

#### Uploading Local Files to Scrapyard

You can pass a local file path to the following iShell command to store a file in Scrapyard
under the folder specified by the `at` argument (helper application v0.4+ is required).

```js
/**
    # Syntax
    **upload-file** _file path_ **at** _folder path_

    # Arguments
    - _file path_ - a local file path
    - _folder path_ - a full path of a folder in Scrapyard

    # Examples
    **upload-file** *d:/documents/my file.pdf* **at** *papers/misc*

    @command
    @markdown
    @icon /res/icons/scrapyard.svg
    @description Stores a local file at the specified Scrapyard folder
    @uuid 674BF919-3BCA-4378-AB8F-C873F8CFE42A
 */
class UploadFile {
    constructor(args) {
        args[OBJECT] = {nountype: noun_arb_text, label: "path"};
        // cmdAPI.scrapyard.noun_type_directory provides the list of all Scrapyard directories
        // to autocompletion. A precaution is taken in the case of missing Scrapyard add-on.
        const directory_noun = cmdAPI.scrapyard?.noun_type_directory || {suggest: () => ({})};
        args[AT] = {nountype: directory_noun, label: "directory"};
    }

    preview({OBJECT, AT}, display) {
        display.text(`Archive file <b>${OBJECT?.text}</b> at the <b>${AT?.text}</b> folder in Scrapyard.`);
    }

    async execute({OBJECT, AT}) {
        if (!OBJECT?.text)
            return;

        const localPath = OBJECT.text;

        let title = localPath.replaceAll("\\", "/").split("/");
        title = title[title.length - 1]; // use file name as the default bookmark title

        // cmdAPI.scrapyard methods offers a more concise way to send messages to Scrapyard from iShell.
        // Method names are camel-case message suffixes with the "SCRAPYARD_" part omitted.
        // For example, the method name for SCRAPYARD_LIST_UUID will be: listUuid.
        // There is no need to specify Scrapyard addon ID and the 'type' parameter.
        cmdAPI.scrapyard.addArchive({
            title:   title,
            url:     localPath,
            path:    AT?.text,
            local:   true,
            select:  true
        });
    }
}
```

Example usage:

**upload-file** *d:/documents/my file.pdf* **at** *papers/misc*

See the iShell [tutorial](https://gchristensen.github.io/ishell/res/tutorial.html) for more details on command authoring.

Because iShell commands can store UUIDs generated by the API and
call, for example, [setInterval](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setInterval)
in the `load` method, you may not need to create separate extensions
even for non-trivial functionality.

