## Automation

Automation is a powerful feature that allows to programmatically create, modify, and delete Scrapyard bookmarks
from [iShell](https://gchristensen.github.io/ishell/) commands or your own extensions.
For example, with this API you can import arbitrarily complex hierarchical content, manage TODO
lists, or create something similar to the former Firefox "Live Bookmarks".

Currently, automation is experimental, and should be
manually enabled from the Scrapyard advanced settings page: **ext+scrapyard://advanced**
<br>
Because Scrapyard knows about iShell, you do not need to enable automation to use the
code below from iShell commands.

All automation features are implemented through the WebExtensions
[runtime messaging API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/sendMessage).
The following messages are currently available:

#### SCRAPYARD_GET_VERSION

Returns Scrapyard version. Useful for testing for Scrapyard presence in the browser:

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
    title:      "Bookmark Title",                 // Bookmark title
    url:        "http://example.com",             // Bookmark URL
    icon:       "http://example.com/favicon.ico", // URL of bookmark favicon
    path:       "shelf/my/directory",             // Bookmark sehlf and directory
    tags:       "comma, separated",               // List of bookmark tags
    details:    "Bookmark details",               // Bookmark details
    todo_state: 1,                                // One of the following integers: 1, 2, 3, 4, 5
                                                  // which represent the TODO, WAITING, POSTPONED, DONE, CANCELLED
                                                  // TODO states respectively
    todo_date:  "YYYY-MM-DD",                     // TODO expiration date
    container:  "firefox-container-1",            // cookieStoreId of a Firefox Multi-Account container
    select:     true                              // Select the bookmark in the interface
});
```

All parameters are optional. Directories in the bookmark path will be created automatically, if not exist.
The relevant missing parameters (url, title, icon) will be captured from the active tab. In this and the
following API the icon URL is used by Scrapyard only to store its image in the database, so it may be a URL from a
local server, or a [data-URL](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs).
If this parameter is explicitly set to an empty string, the default icon will be used.

Returns UUID of the newly created bookmark.

Note: if you have [Python](https://www.python.org) installed, a local server could be started simply by
executing `python3 -m http.server` in the desired directory.

#### SCRAPYARD_ADD_ARCHIVE

Creates an archive in Scrapyard.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:         "SCRAPYARD_ADD_ARCHIVE",
    title:        "Bookmark Title",                 // Bookmark title
    url:          "http://example.com",             // Bookmark URL
    icon:         "http://example.com/favicon.ico", // URL of bookmark favicon
    path:         "shelf/my/directory",             // Bookmark sehlf and directory
    tags:         "comma, separated",               // List of bookmark tags
    details:      "Bookmark details",               // Bookmark details
    todo_state:   1,                                // One of the following integers: 1, 2, 3, 4, 5
                                                    // which represent the TODO, WAITING, POSTPONED, DONE, CANCELLED
                                                    // TODO states respectively
    todo_date:    "YYYY-MM-DD",                     // TODO expiration date
    container:    "firefox-container-1",            // cookieStoreId of a Firefox Multi-Account container
    content:      "<p>Archive content</p>",         // A String or ArrayBuffer, representing the text or bytes of the archived content
                                                    // HTML-pages, images, PDF-documents, and other files could be stored
    content_type: "text/html",                      // MIME-type of the stored content
    pack:         true,                             // Pakck and store the page specified by the bookmark url, do not use the content parameter
    hide_tab:     false,                            // Hide tab, necessary to pack the page
    select:       true                              // Select the bookmark in the interface
});
```

All parameters are optional. Directories in the bookmark path will be created automatically, if not exist.
The relevant missing parameters (url, title, icon, content, content_type) will be captured
from the active tab. If the `url` parameter is explicitly set to an empty string,
it will remain empty.

When the `pack` parameter is specified, this API ignores the `content` parameter, and packs, then stores the page defined by the `url`
parameter. "text/html" content type is assumed. A new tab is created, which is required for page packing (see the API below).
The tab could be hidden through the `hide_tab` message option. Although this option may be useful
in the case of mass API calls, please be careful with it, since Firefox may complain about hidden
tabs and offer to remove the addon.

Returns UUID of the newly created archive.

#### SCRAPYARD_PACK_PAGE

Packs content of all resources (images, CSS, etc.) referenced by a web-page into a single HTML string.
When displayed in the browser, such a page will not rely on any external dependencies
and could be served from a database.
Use this API, for example, when you need to get icon or title from the captured page, or to somehow modify it.
This API creates a new tab which is required for its operation and closes it on completion.
The tab could be hidden through the `hide_tab` message option. Although this option may be useful
in the case of mass API calls, please be careful with it, since Firefox may complain about hidden
tabs and offer to remove the addon.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:     "SCRAPYARD_PACK_PAGE",
    url:      "http://example.com",  // URL of the page to be packed
    hide_tab: false                  // Hide the tab used by the API
});
```

Returns an HTML string with the content of the specified page and all its referenced resources.

#### SCRAPYARD_GET_UUID

Retrieves the properties of a bookmark or archive defined by the given UUID.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:       "SCRAPYARD_GET_UUID",
    uuid:       "F0D858C6ED40416AA402EB2C3257EA17"
});
```

Returns an object with the following properties:

* uuid
* title
* url
* tags
* details
* todo_state
* todo_date
* container

#### SCRAPYARD_UPDATE_UUID

Updates the properties of a bookmark or archive defined by the given UUID.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:       "SCRAPYARD_UPDATE_UUID",
    uuid:       "F0D858C6ED40416AA402EB2C3257EA17",
    title:      "Bookmark Title",                 // Bookmark title
    url:        "http://example.com",             // Bookmark URL
    icon:       "http://example.com/favicon.ico", // URL of bookmark favicon
    tags:       "comma, separated",               // List of bookmark tags
    details:    "Bookmark details",               // Bookmark details
    todo_state: 1,                                // One of the following integers: 1, 2, 3, 4, 5
                                                  // which represent the TODO, WAITING, POSTPONED, DONE, CANCELLED
                                                  // TODO states respectively
    todo_date:  "YYYY-MM-DD",                     // TODO expiration date
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

Opens a bookmark or archive defined by the UUID, which, for instance, could be
found at the bookmark property dialog.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type: "SCRAPYARD_BROWSE_UUID",
    uuid: "F0D858C6ED40416AA402EB2C3257EA17"
});
```

### Examples: Creating Dedicated iShell Bookmark Commands

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

Let's write a function, that will allow to create such commands with one line of code.

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

// Now the commands above, as any other, could be created with a single function call:

createBookmarkCommand("my-twitter", "F0D858C6ED40416AA402EB2C3257EA17");
createBookmarkCommand("my-site", {"personal": "589421A3D93941B4BAD4A2DEE8FF5297",
                                  "work":     "6C53355203D94BC59996E21D15C86C3E"});

```

See the iShell [tutorial](https://gchristensen.github.io/ishell/res/tutorial.html) for more details on command authoring.

Because iShell commands can store UUIDs generated by the API and
run, for example, [setInterval](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setInterval)
in the `load` method, you may not need to create separate extensions
even for non-trivial functionality.

