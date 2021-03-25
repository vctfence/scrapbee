function setDarkUITheme() {
    let head = document.getElementsByTagName('head')[0];
    let link = document.createElement('link');
    link.id = 'dark-theme';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = "sidebar_dark.css";
    link.media = 'all';
    head.appendChild(link);
}

function removeDarkUITheme() {
    $("#dark-theme").remove();
}

if (localStorage.getItem("scrapyard-sidebar-theme") === "dark")
    setDarkUITheme();

