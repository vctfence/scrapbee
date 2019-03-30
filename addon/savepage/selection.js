var root = null;
var sel = window.getSelection();

if (sel && !sel.isCollapsed) {
    let id = 1;

    root = document.createElement("div")
    root.style.display = "none";
    //document.body.appendChild(root);

    for (let i = 0; i < sel.rangeCount; ++i) {
        let range = sel.getRangeAt(i);

        if (range.isCollapsed)
            continue;

        let clonedContents = range.cloneContents();

        let parents = [];
        let parent = range.commonAncestorContainer;

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

            next.appendChild(clonedContents);
        }
        else
            root.appendChild(clonedContents);
    }

    document.querySelectorAll(`*[savepage-extraction-id]`)
        .forEach(e => e.removeAttribute("savepage-extraction-id"));
}

root? root.innerHTML: undefined;
