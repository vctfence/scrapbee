
function captureSelection(options) {
    const EXTRACTION_ID_ATTR = "scrapyard-selection-extraction-id";

    let sel = window.getSelection();
    let root = null;
    let id = 1;

    function retainStructure(parent, content) {
        let parents = [];

        if (parent.nodeType === 3)
            parent = parent.parentNode;

        // mark all encountered parents including <html>
        while (parent && parent.localName !== "html") {
            let parentId = parent.getAttribute(EXTRACTION_ID_ATTR);
            if (!parentId)
                parent.setAttribute(EXTRACTION_ID_ATTR, id++);

            parents.push(parent.cloneNode(false));
            parent = parent.parentElement;
        }

        parents.reverse();
        parents.shift(); // drop <html>;

        if (parents.length) {
            let next = parents.shift();

            // traverse parents, drop ones that already attached to root
            while (parents.length
                    && root.querySelector(`*[${EXTRACTION_ID_ATTR}='${parents[0].getAttribute(EXTRACTION_ID_ATTR)}']`)) {
                next = parents.shift();
            }

            let existing = root.querySelector(`*[${EXTRACTION_ID_ATTR}='${next.getAttribute(EXTRACTION_ID_ATTR)}']`);

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

    document.querySelectorAll(`*[${EXTRACTION_ID_ATTR}]`)
        .forEach(e => e.removeAttribute(EXTRACTION_ID_ATTR));

    let html;

    if (root) {
        root.querySelectorAll(`*[${EXTRACTION_ID_ATTR}]`).forEach(e => e.removeAttribute(EXTRACTION_ID_ATTR));

        html = root.innerHTML;

        if (options._style) {
            let style = options._style.replace(/</g, '&lt;')
                                      .replace(/>/g, '&gt;')
            html = `<style>${style}</style>` + html;
        }
    }

    return html;
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "CAPTURE_SELECTION":
            sendResponse(captureSelection(message.options));
            break;
    }
});
