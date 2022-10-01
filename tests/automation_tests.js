/**
 @command
 */
class ScrGetVersion {
    async preview(args, display) {

        try {
            let version = await cmdAPI.scrapyard.getVersion();
            display.text(`Scrapyard version: ${version}`);
        }
        catch (e) {
            display.error("Scrapyard is not installed or automation is disabled");
        }

    }
}

/**
 @command
 */
class ScrAddBookmark {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addBookmark({
            url:        "http://example.com",
            title:      "Example Bookmark",
            icon:       "http://example.com/favicon.ico",
            path:       "shelf/my/directory",
            tags:       "comma, separated",
            details:    "Bookmark details",
            todo_state: "TODO",
            todo_date:  "2022-02-20",
            comments:   "test\ncomment",
            container:  "firefox-container-1",
            select:     true
        });

        console.log(uuid)
    }
}

/**
 @command
 */
class ScrAddArchiveTab {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addArchive({
            path:       "shelf/my/directory",
            tags:       "comma, separated",
            details:    "Bookmark details",
            todo_state: "TODO",
            todo_date:  "2022-02-20",
            comments:   "test\ncomment",
            container:  "firefox-container-1",
            select:     true
        });

        console.log(uuid)
    }
}

/**
 @command
 */
class ScrAddArchiveUrl {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addArchive({
            url:        "http://example.com",
            title:      true,
            icon:       true,
            path:       "shelf/my/directory",
            tags:       "comma, separated",
            details:    "Bookmark details",
            todo_state: "TODO",
            todo_date:  "2022-02-20",
            comments:   "test\ncomment",
            container:  "firefox-container-1",
            select:     true,
            pack:       true
        });

        console.log(uuid)
    }
}

/**
 @command
 */
class ScrAddArchiveContent {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addArchive({
            url:        "http://example.com",
            title:      "Example Archive (Content)",
            icon:       "http://example.com/favicon.ico",
            path:       "shelf/my/directory",
            tags:       "comma, separated",
            details:    "Bookmark details",
            todo_state: "TODO",
            todo_date:  "2022-02-20",
            comments:   "test\ncomment",
            container:  "firefox-container-1",
            select:     true,
            content:    "<p>Example content</p>",
            content_type: "text/html"
        });

        console.log(uuid)
    }
}


/**
 @command
 */
class ScrAddArchiveLocal {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addArchive({
            url:        "D:/sandbox/firefox/scrapyard/addon/icons/cloud.png",
            title:      "Example Archive (Local)",
            icon:       "",
            path:       "shelf/my/directory",
            tags:       "comma, separated",
            details:    "Bookmark details",
            todo_state: "TODO",
            todo_date:  "2022-02-20",
            comments:   "test\ncomment",
            container:  "firefox-container-1",
            select:     true,
            local:      true
        });

        console.log(uuid)
    }
}


/**
 @command
 */
class ScrPackPage {
    async execute(args) {

        const object = await cmdAPI.scrapyard.packPage({
            url:      "http://example.com"
        });

        console.log(object)
    }
}

/**
 @command
 */
class ScrGetItem {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addBookmark({
            url:        "http://example.com",
            title:      "Example Bookmark",
            icon:       "http://example.com/favicon.ico",
            path:       "shelf/my/directory",
            tags:       "comma, separated",
            details:    "Bookmark details",
            todo_state: "TODO",
            todo_date:  "2022-02-20",
            comments:   "test\ncomment",
            container:  "firefox-container-1",
            select:     true
        });

        const object = await cmdAPI.scrapyard.getItem({
            uuid
        });

        console.log(object)
    }
}

/**
 @command
 */
class ScrUpdateItem {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addBookmark({
            url:        "http://example.com",
            title:      "Example Bookmark",
            icon:       "http://example.com/favicon.ico",
            path:       "shelf/my/directory",
            tags:       "comma, separated",
            details:    "Bookmark details",
            todo_state: "TODO",
            todo_date:  "2022-02-20",
            comments:   "test\ncomment",
            container:  "firefox-container-1",
            select:     true
        });

        await cmdAPI.scrapyard.updateItem({
            uuid,
            title:      "New title",
            url:        "https://example.com",
            icon:       "https://example.com/favicon.ico",
            tags:       "comma, separated tags",
            details:    "New bookmark details",
            todo_state: "DONE",
            todo_date:  "2022-02-21",
            comments:   "new comments",
            container:  "firefox-container-2",
            refresh:    true
        });
    }
}

/**
 @command
 */
class ScrDeleteItem {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addBookmark({
            url:        "http://example.com",
            title:      "Example Bookmark",
            icon:       "http://example.com/favicon.ico",
            path:       "shelf/my/directory",
            select:     true
        });

        await cmdAPI.scrapyard.deleteItem({
            uuid,
            refresh: true
        });
    }
}

/**
 @command
 */
class ScrBrowseItem {
    async execute(args) {

        const uuid = await cmdAPI.scrapyard.addBookmark({
            url:        "http://example.com",
            title:      "Example Bookmark",
            icon:       "http://example.com/favicon.ico",
            path:       "shelf/my/directory",
            select:     true
        });

        await cmdAPI.scrapyard.browseItem({
            uuid
        });
    }
}
