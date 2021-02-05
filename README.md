# Scrapyard

A Scrapbook alternative for Firefox Quantum.

This is a development page. Please visit the main site at: https://gchristensen.github.io/scrapyard/

### Background

Since the departure of Scrapbook I have converted all my Scrapbook stuff into an org-mode
based wiki, but it was very painful to add bookmarks there. Because I needed a bookmark
manager with some org-mode goodness which I would be able to control from UbiquityWE,
I decided to rewrite [vctfence's](https://github.com/vctfence) ScrapBee from scratch
to obtain the desired features.

### Automation

The following call from your addon will add the page at the active tab as an archive/bookmark to Scrapyard.

```javascript
browser.runtime.sendMessage("scrapyard-we@firefox", {
    type: "SCRAPYARD_ADD_ARCHIVE", // also "SCRAPYARD_ADD_BOOKMARK"
    name: "bookmark title",
    path:  "shelf/my/directory",
    tags:  "comma,separated",
    details:  "bookmark description"
});
```

### Project status

Currently the project is considered permanent alpha: be prepared for breaking changes, devastating bugs and
groundbreaking experiments. Please, backup your Firefox profile often.

### Objectives

* ~~Store data at IndexedDB~~ [DONE]
* ~~Replace "RDF" tree with jsTree~~ [DONE]
* ~~Add fancy user-action popup with tree of directories to add bookmarks to~~ [DONE]
* ~~Store archived web-pages as single file a la SavePageWE in a DB-record~~ [DONE]
* ~~Rework archive page editing tools to accomodate new storage method~~ [DONE]
* ~~Store indexed content of downloaded html documents in the database~~ [DONE]
* ~~Add search text input on toolbar; search by tags, title, content and in Firefox bookmarks~~ [DONE]
* ~~Control from~~ [UbiqiutyWE](https://gchristensen.github.io/ubiquitywe/) [DONE]
* ~~Basic TODO functionality a la org~~ [DONE]
* ~~Import/export from .org~~ [DONE]
* ~~Import from Firefox/Chrome .html~~
* ~~Rework settings page~~ [DONE]
* ~~Dark theme~~ [DONE]
* ~~Write help~~ [DONE]
* ~~A little bit of Wiki functionality: editable notes in org markup~~ [DONE]
* ~~Live link auto checker~~ [DONE]
* ~~Self-hosted cloud-synchronization backend (possibly with bookmark access through the web)~~
* ~~Added helper application [DONE]~~

### Current status of cloud support

Currently cloud bookmarking is implemented on the basis of Dropbox HTTP API, which is by definition a mock
implementation - since there is no real database, the speed of operations is inversely proportional to
the amount of bookmarks you have there. When the author will get enough donations to buy a brand-new laptop
for comfortable development (probably never, but you may change this), there will be a dedicated cloud
backend with a real DB, ability to backup all bookmark there, bookmark browsing on mobile platforms, et cetera, et cetera.

### Changes

See [version history at AMO](https://addons.mozilla.org/en-US/firefox/addon/scrapyard/versions/).
