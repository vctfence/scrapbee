# Scrapyard

A Scrapbook alternative for Firefox Quantum.

This is a development page. Please visit the main site at: https://gchristensen.github.io/scrapyard/

### Background

Since the departure of Scrapbook I have converted all my Scrapbook stuff to an org-mode
based wiki, but it was very painful to add bookmarks there. Because I needed a bookmark 
manager with some org-mode goodness which I would be able to control from UbiquityWE, 
I decided to rewrite [vctfence's](https://github.com/vctfence) ScrapBee from scratch to obtain the desired features.

### Import from RDF

Although it is possible in principle (for example, through an external python/flask
based utility which will serve saved Scrapbook files), this is not in author's 
set of priorities. But you may try to automate this with your own Firefox add-on. The call: 

```javascript
browser.runtime.sendMessage("scrapyard@firefox", {
    type: "SCRAPYARD_ADD_ARCHIVE",
    name: "bookmark title",
    path:  "shelf/my/directory",
    tags:  "comma,separated",
    details:  "bookmark description"
});
``` 

will add the page at the opened tab as an archive to Scrapyard.

### Project status

Currently the project status is permanent alpha: be prepared for breaking changes, devastating bugs and 
groundbreaking experiments. Please, backup your data often.

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
* Self-hosted cloud-synchronization backend (possibly with bookmark access through the web)

### In Action

![screen](/media/screen.gif?raw=true)
