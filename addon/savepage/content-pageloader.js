let existing = document.getElementById("savepage-pageloader");

if (!existing) {
    let script = document.createElement("script");
    script.id = "savepage-pageloader";
    script.src = browser.runtime.getURL("savepage/pageloader.js");

    document.head.appendChild(script);
}

null;
