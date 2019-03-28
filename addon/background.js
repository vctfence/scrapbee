import Storage from "./db.js"

let storage = new Storage();

browser.runtime.onMessage.addListener(message => {
    switch (message.type) {
        case "":
            break;
    }
});
