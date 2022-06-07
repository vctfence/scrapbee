export function load() {
    $("a.settings-menu-item[href='#debug']").show();

    $("#debug-browser-version").text(navigator.userAgent);
    $("#debug-addon-version").text(browser.runtime.getManifest().version);

    const addonID = browser.runtime.getManifest().applications?.gecko?.id;
    const consoleURL = `about:devtools-toolbox?id=${addonID}&type=extension`
    $("#debug-log-url").text(consoleURL)
}

