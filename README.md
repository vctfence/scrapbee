# Scrapyard

A Scrapbook alternative for Firefox Quantum.

This is a development page. Please visit the main site at: https://gchristensen.github.io/scrapyard/

### Background

Since the departure of Scrapbook I have converted all my Scrapbook stuff into an org-mode
based wiki, but it was very painful to add bookmarks there. Because I needed a bookmark
manager with some org-mode goodness which I would be able to control from [iShell](https://gchristensen.github.io/ishell/),
I decided to rewrite [vctfence's](https://github.com/vctfence) ScrapBee from scratch
to obtain the desired features.

It is 2020s now, and it may be a right time to abandon XML-based RDF and move towards databases, JSON
and cloud services. For an advanced user Scrapyard may become a cloud bookmarking solution of choice. Please see
the [online help](https://gchristensen.github.io/scrapyard/addon/ui/locales/en/help.html) for more details.

### Objectives

* [DONE] Store data at IndexedDB
* [DONE] Replace "RDF" tree with [jsTree](https://www.jstree.com/)
* [DONE] Add a fancy user-action popup with tree of directories to add bookmarks into
* [DONE] Since it is GPL, use [SavePageWE](https://addons.mozilla.org/en-US/firefox/addon/save-page-we/) engine to save pages in a DB-record as a single file (many kudos to SavePageWE developers)
* [DONE] Rework archive page editing tools to accommodate new storage method
* [DONE] Store indexed content of downloaded html documents in the database
* [DONE] Add search text input on the toolbar; search by tags, title, content and other attributes
* [DONE] Control from [iShell](https://gchristensen.github.io/ishell/)
* [DONE] Basic TODO functionality a la ORG
* [DONE] Import/export from .org
* [DONE] Import from Firefox/Chrome .html bookmarks
* [DONE] Rework settings page
* [DONE] Dark theme
* [DONE] Write help
* [DONE] A little bit of Wiki functionality: editable notes in org markup and other formats
* [DONE] Duplicate/rotten link checker
* [DONE] Create an android application to share/pick up links to/from the cloud
* [DONE] Create a helper application to transcend limits of WebExtensions
* [DONE] Import of ScrapBook RDF archives
* [DONE] Multi-account containers support
* [DONE] Automation API
* [DONE] Full text search/filtering through archived content, notes and comments
* [DONE] Backup management UI
* [DONE] File-based synchronization
* [DONE] Add ability to browser synchronized bookmarks to the android application
* [DONE] Add ability to capture entire sites a la WebScrapBook
* [DONE] Add ability to undo bookmark deletions

### Manifest v3 Status

The addon is successfully ported to the manifest v3 as it is
[implemented](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
in Firefox Nightly v102. To run with MV3 rename manifest.json.mv3 to manifest.json.
