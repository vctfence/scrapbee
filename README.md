# Scrapyard

A Scrapbook alternative for Firefox Quantum.

This is a development page. Please visit the main site at: https://gchristensen.github.io/scrapyard/

### Background

Since the departure of Scrapbook I have converted all my Scrapbook stuff into an org-mode
based wiki, but it was very painful to add bookmarks there. Because I needed a bookmark
manager with some org-mode goodness which I would be able to control from [iShell](https://gchristensen.github.io/ishell/),
I decided to rewrite [vctfence's](https://github.com/vctfence) ScrapBee from scratch
to obtain the desired features.

### Objectives

* ~~Store data at IndexedDB~~ [DONE]
* ~~Replace "RDF" tree with jsTree~~ [DONE]
* ~~Add a fancy user-action popup with tree of directories to add bookmarks~~ [DONE]
* ~~Store archived web-pages as single file a la SavePageWE in a DB-record~~ [DONE]
* ~~Rework archive page editing tools to accommodate new storage method~~ [DONE]
* ~~Store indexed content of downloaded html documents in the database~~ [DONE]
* ~~Add search text input on the toolbar; search by tags, title, content and in Firefox bookmarks~~ [DONE]
* ~~Control from~~ [iShell](https://gchristensen.github.io/ishell/) [DONE]
* ~~Basic TODO functionality a la org~~ [DONE]
* ~~Import/export from .org~~ [DONE]
* ~~Import from Firefox/Chrome .html~~
* ~~Rework settings page~~ [DONE]
* ~~Dark theme~~ [DONE]
* ~~Write help~~ [DONE]
* ~~A little bit of Wiki functionality: editable notes in org markup and other formats~~ [DONE]
* ~~Live link auto checker~~ [DONE]
* ~~Helper application [DONE]~~
* ~~Multi-account containers support [DONE]~~
* ~~Automation API [DONE]~~
* ~~Full text search through archived content, notes and comments [DONE]~~

### Project status

Currently, the project is considered as a permanent alpha: be prepared for breaking changes, devastating bugs and
groundbreaking experiments. Please, backup your Firefox profile often. Scrapyard also could be incredibly buggy at times,
when major internal refactoring are performed, since I have not enough resources for proper QA, so users are the last
frontier of it. Nevertheless, do not forget to donate if you have a good use of the software.

### The current status of cloud support

Currently, cloud bookmarking is implemented on the basis of the Dropbox HTTP API, which is by definition a mock
implementation - since there is no real database, the speed of operations is inversely proportional to
the amount of bookmarks you have there. When the author will get enough donations to buy a brand-new laptop
for comfortable development (probably never, but you may change this), there will be a dedicated cloud
backend with a real DB, ability to backup all bookmark there, bookmark browsing on mobile platforms, et cetera, et cetera.
