function loadCSSFile(id, file) {
    let head = document.getElementsByTagName("head")[0];
    let link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = file;
    link.media = "all";
    head.appendChild(link);
}

function setDarkUITheme() {
    loadCSSFile("dark-theme", "sidebar_dark.css");
}

function removeDarkUITheme() {
    $("#dark-theme").remove();
}

if (localStorage.getItem("scrapyard-sidebar-theme") === "dark")
    setDarkUITheme()

if (localStorage.getItem("sidebar-show-sync") === "show")
    loadCSSFile("show-sync-button", "sidebar_show_sync.css");
