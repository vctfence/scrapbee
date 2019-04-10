
function captureSelection(options) {
    let sel = window.getSelection();
    let root = null;
    let id = 1;

    function retainStructure(parent, content) {
        let parents = [];

        if (parent.nodeType === 3)
            parent = parent.parentNode;

        // mark all encountered parents including <html>
        while (parent && parent.localName !== "html") {
            let parentId = parent.getAttribute("savepage-extraction-id");
            if (!parentId)
                parent.setAttribute("savepage-extraction-id", id++);

            parents.push(parent.cloneNode(false));
            parent = parent.parentElement;
        }

        parents.reverse();
        parents.shift(); // drop <html>;

        if (parents.length) {
            let next = parents.shift();

            // traverse parents, drop ones that already attached to root
            while (parents.length
            && root.querySelector(`*[savepage-extraction-id='${parents[0].getAttribute("savepage-extraction-id")}']`)) {
                next = parents.shift();
            }

            let existing = root.querySelector(`*[savepage-extraction-id='${next.getAttribute("savepage-extraction-id")}']`);

            if (!existing)
                root.appendChild(next)
            else
                next = existing;

            // append all unseen nodes
            for (let parent of parents) {
                next.appendChild(parent);
                next = parent;
            }

            next.appendChild(content);
        }
        else
            root.appendChild(content);
    }


    if ((!sel || sel.isCollapsed) && (options._selector || options._filter)) {
        root = document.createElement("div")

        let parts = options._selector
            ? Array.prototype.slice.call(document.querySelectorAll(options._selector))
            : Array.prototype.slice.call(document.body.childNodes);

        for (let part of parts) {
            retainStructure(part.parentNode, part.cloneNode(true));
        }

        if (options._filter) {
            let filtered = root.querySelectorAll(options._filter);

            filtered.forEach(n => {
                n.parentNode.removeChild(n);
            })
        }
    }
    else if (sel && !sel.isCollapsed) {
        root = document.createElement("div")

        for (let i = 0; i < sel.rangeCount; ++i) {
            let range = sel.getRangeAt(i);

            if (range.isCollapsed)
                continue;

            retainStructure(range.commonAncestorContainer, range.cloneContents());
        }
    }


    document.querySelectorAll(`*[savepage-extraction-id]`)
        .forEach(e => e.removeAttribute("savepage-extraction-id"));

    return root ? root.innerHTML : undefined;
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "CAPTURE_SELECTION":
            sendResponse(captureSelection(message.options));
            break;
    }
});
