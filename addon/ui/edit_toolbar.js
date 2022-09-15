$(document).ready(async function () {
    const toolbar = new EditToolbar();

    $(window).on("beforeunload", e => {
        if (toolbar._unsavedChanges)
            e.preventDefault();
    })
});

class EditToolbar {
    constructor() {
        this.targetBorder = $("<div id='scrapyard-dom-eraser-border'>").appendTo(document.body);
        this.buildTools()

        window.addEventListener("mousedown", e => {
            if (e.button === 0) {
                /** remove dom node by cleaner */
                if (!isDescendant(this.rootContainer, e.target) && this.last && this.erasing) {
                    e.preventDefault();
                    this.last.parentNode.removeChild(this.last);
                    this.last = null;
                    /** check next hover target after current target removed */
                    var em = new Event('mousemove');
                    em.pageX = e.pageX;
                    em.pageY = e.pageY;
                    window.dispatchEvent(em);
                }
                /** hide marker-pen menu when click somewhere */
                if (!$(e.target).hasClass("scrapyard-marker-button")) {
                    if ($(this.menu).is(":visible")) {
                        e.preventDefault();
                        $(this.menu).hide();
                    }
                }
            }
        });

        window.addEventListener("mousemove", e => {
            /** hover dom node by cleaner */
            if (this.erasing) {

                var dom = document.elementFromPoint(e.pageX, e.pageY - window.scrollY);
                if (dom && !isDescendant(this.rootContainer, dom)) {
                    if (dom !== document.body && $(document.body).closest(dom).length === 0) {
                        this.last = dom;
                        var r = dom.getBoundingClientRect();
                        this.targetBorder.css("pointer-events", "none");
                        this.targetBorder.css("box-sizing", "border-box");
                        this.targetBorder.css({
                            border: "2px solid #f00",
                            position: "absolute",
                            left: parseInt(r.left) + "px",
                            top: parseInt(r.top + window.scrollY) + "px",
                            width: r.width + "px",
                            height: r.height + "px",
                            zIndex: 2147483646
                        });
                        this.targetBorder.show();
                    }
                    else {
                        this.targetBorder.hide();
                        // document.body or ancestors
                    }
                }
            }
        });
    }

    isSelectionPresent() {
        let selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            return !selection.getRangeAt(0).collapsed;
        }
        return false;
    }

    deselect() {
        let selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            selection.collapseToStart();
        }
    }

    toggleDomEraser(on) {
        this.last = null;
        this.erasing = on;
        this.targetBorder.hide();
        $(this.editBar).find("input[type=button]").prop("disabled", on);
        document.body.style.cursor = this.erasing? "crosshair": "";
    }

    formatPageInfo(node) {
        let html = "";

        if (node?.__formatted_date)
            html += `<b>Added on:</b> ${node?.__formatted_date}`;

        if (node?.__formatted_date && node?.__formatted_size)
            html += ", ";

        if (node?.__formatted_size)
            html += `<b>Size:</b> ${node?.__formatted_size}`;

        if (!html)
            html = "&lt;no data&gt;";

        return html;
    }

    _fixDocumentEncoding(doc) {
        let meta = doc.querySelector("meta[http-equiv='content-type' i]")
                        || doc.querySelector("meta[charset]");

        if (meta)
            meta.parentNode.removeChild(meta);

        $(doc.getElementsByTagName("head")[0]).prepend(`<meta charset="utf-8">`);
    }

    saveDoc() {
        let saveButton = $("#scrapyard-save-doc-button", this.shadowRoot);
        saveButton.addClass("scrapyard-flash-button");

        setTimeout(() => saveButton.removeClass("scrapyard-flash-button"),1000);

        let doc = document.documentElement.cloneNode(true);
        $(`#scrapyard-edit-bar-container, #scrapyard-dom-eraser-border`, doc).remove();

        this._fixDocumentEncoding(doc);

        const uuid = location.href.split("/").at(-2);

        browser.runtime.sendMessage({
            type: "updateArchive",
            uuid,
            data: "<!DOCTYPE html>" + doc.outerHTML
        }).then(async () => {
            return browser.runtime.sendMessage({
                type: "getBookmarkInfo",
                uuid
            });
        })
        .then(node => {
            $("#scrapyard-page-info", this.editBar).html(this.formatPageInfo(node))
        });
    }

    buildTools() {
        const CONTAINER_HEIGHT = 42;
        const EXTENSION_ID = browser.i18n.getMessage("@@extension_id");
        const documentMarginBottom = document.body.style.marginBottom;

        let erasing = false;
        let contentEditing = false;
        let scrapyardHideToolbar = false;

        /** toolbar */
        const rootContainer = this.rootContainer = $(`<div id="scrapyard-edit-bar-container"></div>`)
            .appendTo(document.body)[0];

        const shadowRoot = this.shadowRoot = rootContainer.attachShadow({mode: 'open'});
        shadowRoot.innerHTML = `
            <style id="scrapyard-toolbar-style"></style>
            <div id="scrapyard-edit-bar">`;

        const editBar = this.editBar = $("#scrapyard-edit-bar", shadowRoot)[0];
        const append = html => $(html).appendTo(editBar);

        append(`<img id="scrapyard-icon" src=""><b id="scrapyard-brand">Scrapyard</b>`);

        append(`<input id="scrapyard-save-doc-button" type="button" class="yellow-button" value="Save">`)
            .on("click", e => {
                this._unsavedChanges = false;
                this.saveDoc();
            });

        append(`<input id="scrapyard-edit-doc-button" type="button" class="blue-button" value="Edit Document">`)
            .on("click", e => {
                contentEditing = !contentEditing;
                e.target.className = contentEditing? "yellow-button": "blue-button";
                e.target.value = contentEditing ? "Finish editing" : "Edit document";

                document.designMode = document.designMode === "on"? "off": "on";

                $("#scrapyard-dom-eraser-button", editBar).prop("disabled", contentEditing);
            });

        append(`<div class="scrapyard-icon-container">
                         <i class="scrapyard-help-mark"></i>
                         <span class="scrapyard-tips scrapyard-hide">
                             To remove content, text-select it (including images and other media) and press Del key on keyboard.
                             It is also possible to type something in. Press F7 to turn on caret browsing.
                         </span>
                     </div>`);

        append(`<input id="scrapyard-dom-eraser-button" type="button" class="blue-button" value="DOM Eraser">`)
            .on("click", e => {
                erasing = !erasing;
                this.toggleDomEraser(erasing)
                e.target.className = erasing? "yellow-button": "blue-button";
                $(e.target).prop("disabled", false);
            });

        append(`<input id="scrapyard-marker-button" type="button" class="blue-button" value="Marker Pen">`)
            .on("click", e => {
                $(this.menu).toggle();
                let rect_div = editBar.getBoundingClientRect();
                let rect_btn = e.target.getBoundingClientRect();
                $(this.menu).css("bottom", (rect_div.bottom - rect_btn.top) + "px");
                $(this.menu).css("left", rect_btn.left + "px");
            });

        const menu = append(`<div id="scrapyard-marker-menu"></div>`);
        const appendMenu = html => $(html).appendTo(menu);
        this.menu = menu[0];

        appendMenu(`<div class="scrapyard-menu-item-wrapper">
                            <div class='scrapyard-menu-item'>Clear Markers</div>
                         </div>`)
            .on("mousedown", e => {
                e.preventDefault()

                $(menu).hide();
                if (this.isSelectionPresent()) {
                    clearMarkPen();
                    this.deselect();
                }
                else
                    alert("No active selection.");
            });


        for (let i = 1; i <= 8; ++i) {
            appendMenu(`<div class="scrapyard-menu-item-wrapper">
                                <div class='scrapyard-menu-item scrapyard-marker-${i}'>Example Text</div>
                             </div>`)
                .on("mousedown", e => {
                    e.preventDefault()

                    $(menu).hide();
                    if (this.isSelectionPresent()) {
                        mark(`scrapyard-marker-${i}`);
                        this._unsavedChanges = true;
                        this.deselect();
                    }
                    else
                        alert("No active selection.");
                });
        }

        const autoOpenCheck = append(`<input id="scrapyard-auto-open-check" type="checkbox">`)[0];
        append("<label for='scrapyard-auto-open-check'>Auto open</label>");

        $(document).on('mouseup', e => {
            if (autoOpenCheck.checked && this.isSelectionPresent())
                $("#scrapyard-marker-button", shadowRoot).click();
        })
        $(document).on('mousedown', e => {
            if (autoOpenCheck.checked && this.isSelectionPresent() && $(menu).is(":visible") && e.target !== menu)
                $(menu).hide();
        });

        append(`<input id="scrapyard-view-notes" type="button" class="blue-button" value="Notes">`)
            .on("click", e => {
                const iframe = $("#scrapyard-notes-frame");

                if (iframe.length) {
                    iframe.remove();
                    $("#scrapyard-notes-container").remove();
                    $(document.body).removeClass("scrapyard-no-overflow");
                }
                else {
                    if (location.origin.startsWith("http")) {
                        browser.runtime.sendMessage({
                            type: "browseNotes",
                            uuid: location.hash.split(":")[0].substring(1),
                            id: parseInt(location.hash.split(":")[1])
                        });
                    }
                    else {
                        let notes_page = location.origin.replace(/^blob:/, "") + "/ui/notes.html?i"

                        $(document.body).prepend(`<iframe id="scrapyard-notes-frame" src="${notes_page}${location.hash}"/>
                                                  <div id="scrapyard-notes-container"></div>`)
                            .addClass("scrapyard-no-overflow");
                    }
                }
            });


        window.addEventListener("message", e => {
            if (e.data === "SCRAPYARD_CLOSE_NOTES") {
                $("#scrapyard-notes-frame").remove();
                $("#scrapyard-notes-container").remove();
                $(document.body).removeClass("scrapyard-no-overflow");
            }
        }, false);

        append(`<span id="scrapyard-original-url-label">Original URL: </span>`);
        const originalURLText = append(`<input id="scrapyard-original-url-text" type="text" readonly="readonly">`)[0];
        const originalURLLink = append(`<a id="scrapyard-original-url-link" target="_blank" href="#"></a>`)[0];

        const uuid = location.href.split("/").at(-2);

        browser.runtime.sendMessage({
            type: "getBookmarkInfo",
            uuid
        }).then(node => {
            originalURLText.value = node?.uri || "";
            originalURLLink.href = node?.uri || "#";
            $("#scrapyard-page-info", editBar).html(this.formatPageInfo(node))
        });

        append(`<input id="scrapyard-go-button" class="blue-button" type="button" value="Go">`)
            .on("click", e => {
                if (originalURLLink.href !== "#")
                    originalURLLink.click();
            });

        append(`<div class="scrapyard-icon-container">
                        <span id="scrapyard-page-info" class="scrapyard-tips scrapyard-hide"></span>
                        <i class="scrapyard-i-mark"></i>
                     </div>`);

        append(`<input id="scrapyard-hide-button" type="button" class="blue-button" value="Hide">`)
            .on("click", e => {
                scrapyardHideToolbar = true;
                document.body.style.marginBottom = documentMarginBottom;
                $(rootContainer).hide();
            });

        $(".scrapyard-help-mark", editBar).hover(e => {
            $(e.target).next(".scrapyard-tips.scrapyard-hide").show().css({"margin-top": "2px", "position": "absolute",
                                                                            "left": "100%", "margin-left": "4px"});
        }, e => {
            $(e.target).next(".scrapyard-tips.scrapyard-hide").hide();
        });

        $(".scrapyard-i-mark", editBar).hover(e => {
            $(e.target).prev(".scrapyard-tips.scrapyard-hide").show().css({"margin-top": "2px", "position": "absolute",
                                                                           "right": "100%", "margin-right": "-14px"});
        }, e => {
            $(e.target).prev(".scrapyard-tips.scrapyard-hide").hide();
        });

        $(document).on("keydown", e => {
            if (e.code === "KeyT" && e.ctrlKey && e.altKey) {
                $(rootContainer).toggle();
                scrapyardHideToolbar = !scrapyardHideToolbar;
                document.body.style.marginBottom =
                    scrapyardHideToolbar
                        ? documentMarginBottom
                        : `${CONTAINER_HEIGHT + 10}px`;
            }
        });

        loadInternalResources(shadowRoot);

        browser.runtime.sendMessage({type: "getHideToolbarSetting"})
            .then(hide => {
                scrapyardHideToolbar = hide;
                if (!scrapyardHideToolbar) {
                    setTimeout(() => {
                        document.body.style.marginBottom = `${CONTAINER_HEIGHT + 10}px`;
                        rootContainer.style.display = "block"
                    }, 300);
                }
            });
    }
}

async function loadInternalResources(shadowRoot) {
    // in MV3 resources marked as web accessible in the manifest become unavailable in the addon scripts
    // so, we need to unmark them as web accessible and load them explicitly in the content script
    const toolbarCSS = browser.runtime.sendMessage({
        type: "loadInternalResource",
        path: "ui/edit_toolbar.css"
    });

    const svgLogo = browser.runtime.sendMessage({
        type: "loadInternalResource",
        path: "icons/scrapyard.svg"
    })

    const svgHelpMark = browser.runtime.sendMessage({
        type: "loadInternalResource",
        path: "icons/help-mark.svg"
    })

    const svgPageInfo = browser.runtime.sendMessage({
        type: "loadInternalResource",
        path: "icons/page-info.svg"
    })

    await Promise.all([toolbarCSS, svgLogo, svgHelpMark, svgPageInfo]);

    $("#scrapyard-toolbar-style", shadowRoot).text(await toolbarCSS);

    $("#scrapyard-icon", shadowRoot).prop("src", `data:image/svg+xml,${encodeURIComponent(await svgLogo)}`);

    $(".scrapyard-help-mark", shadowRoot).css("background-image",
        `url("data:image/svg+xml,${encodeURIComponent(await svgHelpMark)}")`);

    $(".scrapyard-i-mark", shadowRoot).css("background-image",
        `url("data:image/svg+xml,${encodeURIComponent(await svgPageInfo)}")`);
}

function getTextNodesBetween(rootNode, startNode, endNode) {
    var pastStartNode = false, reachedEndNode = false, textNodes = [];

    function getTextNodes(node) {
        if (node == startNode) {
            pastStartNode = true;
        } else if (node == endNode) {
            reachedEndNode = true;
        } else if (node.nodeType == 3) {
            if (pastStartNode && !reachedEndNode && !/^\s*$/.test(node.nodeValue)) {
                textNodes.push(node);
            }
        } else {
            for (var i = 0, len = node.childNodes.length; !reachedEndNode && i < len; ++i) {
                getTextNodes(node.childNodes[i]);
            }
        }
    }

    if (startNode != endNode)
        getTextNodes(rootNode);
    return textNodes;
}

function surround(txnode, tag, cls, start_offset, end_offset) {
    var textRange = document.createRange();
    var el = document.createElement(tag);
    el.className = cls;
    if (Number.isInteger(start_offset) && Number.isInteger(end_offset)) {
        textRange.setStart(txnode, start_offset);
        textRange.setEnd(txnode, end_offset);
    } else {
        textRange.selectNodeContents(txnode);
    }
    textRange.surroundContents(el); /* only work for selection  within textnode */
    textRange.detach()
    return el;
}

function getCurrSelection() {
    var selection = {}
    selection.range = window.getSelection().getRangeAt(0);
    selection.parent = selection.range.commonAncestorContainer; /* element */

    /* these can be only text nodes for selection made by user */
    selection.start = selection.range.startContainer; /* textnode */
    selection.end = selection.range.endContainer; /* textnode */

    return selection;
}

function clearMarkPen() {
    var selection = getCurrSelection()
    $(selection.parent).find(".scrapyard-mark-pen").each(function () {
        if (selection.range.intersectsNode(this))
            $(this).replaceWith($(this).text());
    });
}

function mark(hlclass) {
    var hltag = "span";
    hlclass = "scrapyard-mark-pen " + hlclass;

    var selection = getCurrSelection()

    try {
        /* there are maybe text nodes between start and end (range cross more than one tag) */
        getTextNodesBetween(selection.parent, selection.start, selection.end).forEach(function (tn) {
            surround(tn, hltag, hlclass)
        });

        /* surround edges */
        if (selection.start == selection.end) {
            /** range in single text node */
            var span = surround(selection.start, hltag, hlclass, selection.range.startOffset, selection.range.endOffset);
            if (span && span.firstChild) {
                selection.range.setStart(span.firstChild, 0);
                selection.range.setEnd(span.firstChild, span.firstChild.nodeValue.length);
            }
        }
        else {
            var span1 = surround(selection.start, hltag, hlclass, selection.range.startOffset, selection.start.nodeValue.length);
            var span2 = surround(selection.end, hltag, hlclass, 0, selection.range.endOffset);
            if (span1 && span2 && span1.firstChild && span2.firstChild) {
                selection.range.setStart(span1.firstChild, 0);
                selection.range.setEnd(span2.firstChild, span2.firstChild.nodeValue.length);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

function isDescendant(parent, child) {
    var node = child;
    while (node != null) {
        if (node == parent) {
            return true;
        }
        node = node.parentNode;
    }
    return false;
}

console.log("==> edit_toolbar.js loaded")
