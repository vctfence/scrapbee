const hash = location.hash.split(":");
const uuid = hash[0].substring(1);
const tabId = parseInt(hash[1]);

const iframe = document.getElementById("notes-iframe");
iframe.src = `/ui/notes.html?i#${uuid}`;

window.addEventListener("message", e => {
    if (e.data === "SCRAPYARD_CLOSE_NOTES")
        /* sic! */ chrome.runtime.sendMessage({type: "closeNotes", tabId});
}, false);
