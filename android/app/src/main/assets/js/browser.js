function replaceDocument(content, asset) {
    if (asset === "data")
        content = JSON.parse(content);
    var content = asset === "view"? content: content.object;

    var links = "";
    if ("data" === asset)
        links = "<link rel='stylesheet' href='css/markers.css'/>";
    else if ("view" === asset)
        links = "<link rel='stylesheet' href='css/notes.css'/>"
            + "<link rel='stylesheet' href='css/org.css'/>";

    content = content.replace("</head>", links + "</head>");

    document.open();
    document.write(content);
    document.close();
}
