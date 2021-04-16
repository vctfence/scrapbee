## Automation

Automation is a powerful feature that allows to programmatically create
bookmarks and archives in Scrapyard or browse dedicated bookmarks from
[iShell](https://gchristensen.github.io/ishell/) and your own extensions.
For example, with this API you can import arbitrary content, automate TODO
functionality, or create an
interface to browse dedicated bookmarks you often use.

Currently, automation is experimental in Scrapyard, and should be
manually enabled from its settings page:
**ext+scrapyard://automation**,
which is not displayed at the main UI.
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
    todo_state: 1,                                // One of the following integers: 1, 2, 3,
                                                  // which represent TODO, WAITING, and POSTPONED
                                                  // TODO states respectively
    todo_date:  "YYYY-MM-DD",                     // TODO expiration date
    select:     true                              // Select the bookmark in the interface
});
```
All parameters are optional. The relevant missing parameters will be captured
from the active tab.

Returns UUID of the newly created bookmark.

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
    todo_state:   1,                                // One of the following integers: 1, 2, 3,
                                                    // which represent TODO, WAITING, and POSTPONED
                                                    // TODO states respectively
    todo_date:    "YYYY-MM-DD",                     // TODO expiration date
    content:      "<p>Archive content</p>",         // A String or ArrayBuffer, representing the text or bytes of the archived content
                                                    // HTML-pages, images, PDF-documents, and other files could be stored
    content_type: "mime/type",                      // MIME-type of the stored content
    select:        true                             // Select the bookmark in the interface
});
```
All parameters are optional. The relevant missing parameters will be captured
from the active tab.

Returns UUID of the newly created archive.

#### SCRAPYARD_PACK_PAGE

Packs all resources (images, CSS, etc.) referenced by a web-page into a single HTML string.
This message creates a new tab which is required for its operation and closes it on completion.
The tab could be hidden through the `hide_tab` message option. Please be careful
with this option, since Firefox may complain about hidden tabs and offer to remove
the addon.

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:  "SCRAPYARD_PACK_PAGE",
    url:  "http://example.com",   // URL of the page to be packed
    hide_tab: false               // Hide the created tab
});
```

Returns an HTML string with the content of the specified page and all its referenced resources,
so the whole page may be stored in a single database record.

#### SCRAPYARD_BROWSE_UUID

Opens a bookmark or archive defined by the UUID which could be
found at its property dialog:

```js
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type:  "SCRAPYARD_BROWSE_UUID",
    uuid:  "F0D858C6ED40416AA402EB2C3257EA17"
});
```

### Creating Dedicated iShell Bookmark Commands

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
See the iShell [tutorial](https://gchristensen.github.io/ishell/res/tutorial.html) for more details on command authoring.
