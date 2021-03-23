function setDarkSidebarTheme() {
    let head = document.getElementsByTagName('head')[0];
    let link = document.createElement('link');
    link.id = 'sidebar-theme';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = "sidebar_dark.css";
    link.media = 'all';
    head.appendChild(link);
}

if (localStorage.getItem("scrapyard-sidebar-theme") === "dark")
    setDarkSidebarTheme();

