var DB_TYPE_CLOUD = "cloud"
var DB_TYPE_SYNC = "sync"

var ASSET_FILES = "files"
var ASSET_ARCHIVE = "archive_content.blob"
var ASSET_NOTES = "notes.json"

function replaceDocument(content, asset, dbType) {
    var content = extractContent(content, asset, dbType)
    content = injectStyles(content, asset)

    document.open();
    document.write(content);
    document.close();
}

function extractContent(content, asset, dbType) {
    var result;

    if (ASSET_NOTES === asset) {
        var notes = JSON.parse(content)

        if (notes.html)
            result = notes.html;
        else
            result = "<html><head></head><pre class='plaintext'>" + notes.content + "</pre></body>";
    }
    else if (ASSET_ARCHIVE === asset || ASSET_FILES === asset)
        result = content

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
