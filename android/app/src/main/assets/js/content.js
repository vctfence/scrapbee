var DB_TYPE_CLOUD = "cloud"
var DB_TYPE_SYNC = "sync"

var ASSET_ARCHIVE = "data"
var ASSET_NOTES = "view"

function replaceDocument(content, asset, dbType) {
    var content = extractContent(content, asset, dbType)
    content = injectStyles(content, asset)

    document.open();
    document.write(content);
    document.close();
}

function extractContent(content, asset, dbType) {
    var result;
    if (dbType === DB_TYPE_CLOUD) {
        if (ASSET_NOTES === asset) {
            result = content;
        }
        else if (ASSET_ARCHIVE === asset) {
             content = JSON.parse(content);
             result = content.object;
         }
    }
    else if (dbType === DB_TYPE_SYNC) {
        var lines = content.split("\n")

        if (lines.length > 2) {
            var meta = JSON.parse(lines[0])

            if (meta.sync) {
                content = JSON.parse(lines[2]);
                if (ASSET_ARCHIVE === asset)
                    result = content.archive.object;
                else if (ASSET_NOTES === asset)
                    if (content.notes.html)
                        result = content.notes.html;
                    else
                        result = "<html><head></head><pre class='plaintext'>" + content.notes.content + "</pre></body>";
            }
        }
    }

    return result;
}

function injectStyles(content, asset) {
    var links = "";

    if (ASSET_ARCHIVE === asset)
        links = "<link rel='stylesheet' href='css/markers.css'/>";
    else if (ASSET_NOTES === asset)
        links = "<link rel='stylesheet' href='css/notes.css'/>"
            + "<link rel='stylesheet' href='css/org.css'/>";

    return content.replace("</head>", links + "</head>");
}