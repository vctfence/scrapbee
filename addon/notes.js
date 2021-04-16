import {backend} from "./backend.js"
import * as org from "./org.js"
import {NODE_TYPE_NOTES} from "./storage_constants.js";

let ORG_EXAMPLE = `#+OPTIONS: toc:t num:nil
#+CSS: p {text-align: justify;}

Supported [[http://orgmode.org/][org-mode]] markup features:

* Top Level Heading
** Second Level Heading
*** Third Level Heading

# A comment line. This line will not be displayed.

Paragraphs are separated by at least one empty line.


*** Formatting

*bold*
/italic/
_underlined_
+strikethrough+
=monospaced=
and ~code~

Sub_{script}. a_{1}, a_{2}, and a_{3}.

A horizontal line, fill-width across the page:
-----


*** Links

[[http://orgmode.org][Link with a description]]

http://orgmode.org - link without a description.

*** Lists
- First item in a list.
- Second item.
  - Sub-item
    1. Numbered item.
    2. Another item.
- [ ] Item yet to be done.
- [X] Item that has been done.


*** Definition List

- vim :: Vi IMproved, a programmers text editor
- ed :: Line-oriented text editor


*** TODO

**** TODO A todo item.
**** DONE A todo item that has been done.


*** Directives

**** ~BEGIN_QUOTE~ and ~END_QUOTE~

#+BEGIN_QUOTE
To be or not to be, that is the question.
#+END_QUOTE

**** ~BEGIN_EXAMPLE~ and ~END_EXAMPLE~

#+BEGIN_EXAMPLE
let o = new Object();
o.attr = "string";
#+END_EXAMPLE

**** ~BEGIN_SRC~ and ~END_SRC~

#+BEGIN_SRC javascript
let o = new Object();
o.attr = "string";
#+END_SRC


*** Verbatim text

: Text to be displayed verbatim (as-is), without markup
: (*bold* does not change font), e.g., for source code.
: Line breaks are respected.


*** Table

|-------+--------+------------|
|       | Symbol | Author     |
|-------+--------+------------|
| Emacs | ~M-x~  | _RMS_      |
|-------+--------+------------|
| Vi    | ~:~    | _Bill Joy_ |
|-------+--------+------------|

*** Images

Referenced image:

[[https://upload.wikimedia.org/wikipedia/commons/6/60/Cat_silhouette.svg][Cat silhouette]]

From data URL:

[[data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoBAMAAAB+0KVeAAAAMHRFWHRDcmVhdGlvbiBUaW1lANCf0L0gMTUg0LDQv9GAIDIwMTkgMTU6MzA6MzMgKzA0MDAnkrt2AAAAB3RJTUUH4wQPCx8oBV08nwAAAAlwSFlzAAALEgAACxIB0t1+/AAAAARnQU1BAACxjwv8YQUAAAAwUExURf///7W1tWJiYtLS0oODg6CgoPf39wAAACkpKefn597e3j09Pe/v7xQUFAgICMHBwUxnnB8AAACdSURBVHjaY2AYpoArAUNEjeFsALogZ1HIdgxBhufl5QIYgtexCZaXl2Nqb8em0r28/P5KLCrLy2/H22TaIMQYy+FgK1yQBSFYrgDki6ILFgH9uwUkyIQkWP5axeUJyOvq5ajgFgNDsh6qUFF8AoPs87om16B95eWblJTKy6uF+sonMDCYuJoBjQiviASSSq4LGBi8D8BcJYTpzREKABwGR4NYnai5AAAAAElFTkSuQmCC][Cat silhouette]]
`;

let ORG_DEFAULT_STYLE = `#+CSS: p {text-align: justify;}`;

let MD_EXAMPLE = `[//]: # (p {text-align: justify;})

Supported [Markdown](https://daringfireball.net/projects/markdown/syntax#link) markup features:

# Top Level Heading
## Second Level Heading
### Third Level Heading

[//]: # (A comment line. This line will not be displayed.)

Paragraphs are separated by at least one empty line.


### Formatting

**bold** __text__
*italic* _text_
~~strikethrough~~
and \`monospaced\`

A horizontal line, fill-width across the page:

-----


### Links

[Link with a description](http://orgmode.org)

http://orgmode.org - link without a description.

### Lists
- First item in a list.
- Second item.
* Third item.
  + Sub-item
    1. Numbered item.
    2. Another item.
    1. Third item.


### Code

Inline \`code\`

Indented code

    // Some comments
    line 1 of code
    line 2 of code
    line 3 of code


Block code "fences"

\`\`\`
To be or not to be, that is the question.
\`\`\`


### Blockquotes

> Blockquotes can also be nested...
>> ...by using additional greater-than signs right next to each other...
> > > ...or with spaces between arrows.

### Table

|       | Symbol | Author     |
|-------|--------|------------|
| Emacs | ~M-x~  | _RMS_      |
| Vi    | ~:~    | _Bill Joy_ |


### Images

Referenced image:

![Cat silhouette](https://upload.wikimedia.org/wikipedia/commons/6/60/Cat_silhouette.svg)

From data URL:

![](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAoBAMAAAB+0KVeAAAAMHRFWHRDcmVhdGlvbiBUaW1lANCf0L0gMTUg0LDQv9GAIDIwMTkgMTU6MzA6MzMgKzA0MDAnkrt2AAAAB3RJTUUH4wQPCx8oBV08nwAAAAlwSFlzAAALEgAACxIB0t1+/AAAAARnQU1BAACxjwv8YQUAAAAwUExURf///7W1tWJiYtLS0oODg6CgoPf39wAAACkpKefn597e3j09Pe/v7xQUFAgICMHBwUxnnB8AAACdSURBVHjaY2AYpoArAUNEjeFsALogZ1HIdgxBhufl5QIYgtexCZaXl2Nqb8em0r28/P5KLCrLy2/H22TaIMQYy+FgK1yQBSFYrgDki6ILFgH9uwUkyIQkWP5axeUJyOvq5ajgFgNDsh6qUFF8AoPs87om16B95eWblJTKy6uF+sonMDCYuJoBjQiviASSSq4LGBi8D8BcJYTpzREKABwGR4NYnai5AAAAAElFTkSuQmCC)
`;

let MD_DEFAULT_STYLE = `[//]: # (p {text-align: justify;})`;

const INPUT_TIMEOUT = 3000;

let examples = {"org": ORG_EXAMPLE, "markdown": MD_EXAMPLE};
let styles = {"org": ORG_DEFAULT_STYLE, "markdown": MD_DEFAULT_STYLE};

let node_ids = location.hash? location.hash.split(":"): [];
let node_id = node_ids.length? parseInt(node_ids[node_ids.length - 1]): undefined;
//let node_uuid = node_ids.length? node_ids[0].substring(1): undefined;
let inline = location.href.split("?");
inline = inline.length > 1 && inline[1].startsWith("i#");

let format = "delta";
let align;

let quill;

let editorChange;
let editorTimeout;

function saveNotes() {
    let content = getEditorContent();
    backend.storeNotes(node_id, content, format, align);
    browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !content});
    editorChange = false;
}

function editorSaveOnChange(e) {
    clearTimeout(editorTimeout);

    editorTimeout = setTimeout(() => {
        if (e && node_id) {
            saveNotes();
        }
    }, INPUT_TIMEOUT);
}

function editorSaveOnBlur(e) {
    if (e && node_id) {
        clearTimeout(editorTimeout);
        saveNotes();
    }
}

function initWYSIWYGEditor() {

    $("#editor").hide();
    $("#quill").show();

    var toolbarOptions = [
       // ['showHtml'],
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
        [{ 'font': [] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'align': [] }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['blockquote'],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        ['hr'],
        [ 'link', 'image'],
        ['clean']
    ];

    Quill.prototype.getHTML = function(compatible) {
        const contents = this.getContents().ops;
        const converter = new QuillDeltaToHtmlConverter(contents, {
            encodeHtml: true,
            inlineStyles: !compatible,
            urlSanitizer: v => v
        });

        converter.renderCustomWith(function(customOp, contextOp){
            if (customOp.insert.type === 'hr')
                return "<hr>";
        })

        return converter.convert();
    };

    Quill.prototype.setHTML = function(html) {
        this.pasteHTML(html);
    };

    Quill.prototype.isEmpty = function() {
        if (JSON.stringify(this.getContents()) === "\{\"ops\":[\{\"insert\":\"\\n\"\}]\}")
            return true;
    };

    quill = new Quill('#quill', {
        modules: {
            toolbar: {
                container: toolbarOptions,
                handlers: {
                    showHtml: () => {
                        if ($(quill.txtArea).is(":visible")) {
                            quill.setHTML(quill.txtArea.value);
                            $(".ql-toolbar .ql-formats").slice(1).toggle();
                        }
                        else {
                            quill.txtArea.value = quill.getHTML(true);
                            $(".ql-toolbar .ql-formats").slice(1).toggle();
                        }

                        $(quill.txtArea).toggle();
                    },
                    hr: () => {
                        let range = quill.getSelection();
                        if (range) {
                            quill.insertEmbed(range.index, "hr", "null")
                        }
                    }
                }
            },
            // history: {
            //     delay: 2000,
            //     maxStack: 100,
            //     userOnly: true
            // },
            keyboard: {
                bindings: {
                    _save: {
                        key: 'S',
                        shortKey: true,
                        handler: function (range, context) {
                            saveNotes();
                        }
                    }
                }
            }
        },
        theme: 'snow'
    });

    // quill.clipboard.addMatcher('P', function(node, delta) {
    //     delta.ops.push({insert: "\n"})
    //     return delta;
    // });

    quill.txtArea = document.createElement("textarea");
    quill.txtArea.className = "quill-html-editor";
    document.getElementById("quill").appendChild(quill.txtArea);

    let Link = window.Quill.import('formats/link');
    class ScrapyardLink extends Link {
        static sanitize(url) {
            if(url.startsWith("ext+scrapyard")) {
                return url
            }
            else {
                let value = super.sanitize(url);
                return value;
            }
        }
    }
    Quill.register(ScrapyardLink);

    let Embed = Quill.import('blots/block/embed');
    class Hr extends Embed {
        static create(value) {
            let node = super.create(value);
            node.setAttribute('style', "height:0px; margin-top:10px; margin-bottom:10px;");
            return node;
        }
    }
    Hr.blotName = 'hr';
    Hr.tagName = 'hr';
    Quill.register({'formats/hr': Hr});

    quill.on('selection-change', function(range, oldRange, source) {
        if (range === null && oldRange !== null)
            editorSaveOnBlur(true);
    });

    quill.on('text-change', function(delta, oldDelta, source) {
        editorChange = true;
        editorSaveOnChange(true);
    });

    window.onbeforeunload = function() {
        if (editorChange)
            return true;
    };
}

function closeWYSIWYGEditor() {
    let editor = '#quill';

    if($(editor)[0]) {
        var content = $(editor).find('.ql-editor').html();
        $(editor).html(content);

        $(editor).siblings('.ql-toolbar').remove();
        $(editor + " *[class*='ql-']").removeClass (function (index, css) {
            return (css.match (/(^|\s)ql-\S+/g) || []).join(' ');
        });

        $(editor + "[class*='ql-']").removeClass (function (index, css) {
            return (css.match (/(^|\s)ql-\S+/g) || []).join(' ');
        });

        $(editor).empty();
    }

    quill = null;

    $("#quill").hide();
    $("#editor").show();
}

function initMarkupEditor() {
    $("#quill").hide();
    $("#editor").show();
}

function closeMarkupEditor() {
    $("#quill").show();
    $("#editor").hide();
}

function renderEditorContent(compatible) {
    if (format === "delta")
        return quill.getHTML(compatible);
    else
        return $('#editor').val();
}

function getEditorContent() {
    if (format === "delta") {
        if (quill.isEmpty())
            return "";
        return JSON.stringify(quill.getContents());
    }
    else
        return $('#editor').val();
}

function setEditorContent(content) {
    if (format === "html")
        quill.setHTML(content);
    else if (format === "delta")
        quill.setContents(JSON.parse(content));
    else
        $('#editor').val(content);
}

window.onload = function() {

    if (inline)
        $("#tabbar").html(`<a id="notes-button" class="focus" href="#">Notes</a>
                                 <a id="edit-button" href="#">Edit</a>`);
    else
        $("#tabbar").html(`<div style="margin-left: 20px;">
                                    <span id="notes-for">Notes for: </span>
                                    <span id="source-url" class="source-url"></a>
                                 </div>
                                 <div class="spacer">&nbsp;</div>
                                 <a id="notes-button" class="focus" href="#">View</a>
                                 <a id="edit-button" href="#">Edit</a>`);


    backend.getNode(node_id).then(n => {
        let node = n;
        let source_url = $("#source-url");
        source_url.text(node.name);

        if (node.type === NODE_TYPE_NOTES) {
            source_url.removeClass("source-url");
            source_url.addClass("notes-title");
            $("title").text(node.name);
        }
        else {
            $("title").text("Notes for: " + node.name);
            $("#notes-for").show();
        }

        if (node.type !== NODE_TYPE_NOTES)
            source_url.on("click", e => {
                browser.runtime.sendMessage({type: "BROWSE_NODE", node: node});
            });
    });

    function org2html(org_text) {
        let doc = new org.Parser().parse(org_text);
        let html = new org.ConverterHTML(doc).result;

        let output = "";

        if (doc.directiveValues["css:"])
            $("#notes-style").text(doc.directiveValues["css:"].htmlEncode(true, true));
        else
            $("#notes-style").text("");

        if (doc.options.toc) {
            output += html.tocHTML.replace("<ul", "<ul id='toc'") + html.contentHTML;
        }
        else
            output += html.contentHTML;

        return output;
    }

    function markdown2html(md_text) {
        md_text = md_text || "";

        let m = /^(.*?\r?\n)$/m.exec(md_text);
        let firstLine;
        let css;

        if (m && m[1]) {
            firstLine = m[1];
            m = /\[\/\/]: # \((.*?)\)$/.exec(firstLine.trim());

            if (m && m[1])
                css = m[1];
        }

        if (css)
            $("#notes-style").text(css.htmlEncode(true, true));
        else
            $("#notes-style").text("");

        return marked(md_text);
    }

    function text2html(text) {
        text = text || "";
        let m = /^(.*?\r?\n)$/m.exec(text);
        let firstLine;
        let css;

        if (m && m[1]) {
            firstLine = m[1];
            m = /CSS:(.*?)$/.exec(firstLine.trim());

            if (m && m[1])
                css = m[1];
        }

        if (css) {
            $("#notes-style").text(css.htmlEncode(true, true));
            text = text.replace(firstLine, "");
        }
        else
            $("#notes-style").text("");

        return `<pre class="plaintext">${text.htmlEncode()}</pre>`;
    }

    function prepareHTML(html) {
        $("#notes-style").text("");
        return html;
    }

    function formatNotes(text, format) {
        switch (format) {
            case "org":
                $("#notes").attr("class", "notes format-org").html(org2html(text));
                break;
            case "markdown":
                $("#notes").attr("class", "notes format-markdown").html(markdown2html(text));
                break;
            case "html":
            case "delta":
                $("#notes").attr("class", "notes format-html").html(prepareHTML(text));
                break;
            default:
                $("#notes").attr("class", "notes format-text").html(text2html(text));;
        }
    }

    function alignNotes() {
        $("#space-left").css("flex", align === "left"? "0": "1");
    }

    $("#notes").on("click", "a[href^='org-protocol://']", e => {
        e.preventDefault();
        browser.runtime.sendMessage({type: "BROWSE_ORG_REFERENCE", link: e.target.href});
    });

    $("#tabbar a").on("click", e => {
        e.preventDefault();

        $("#tabbar a").removeClass("focus");
        $(e.target).addClass("focus");

        $(`.content`).hide();
        $(`#content-${e.target.id}`).css("display", "flex");

        if (e.target.id === "notes-button") {
            let content = renderEditorContent();
            formatNotes(content, format);

            $("#format-selector").hide();
            $("#align-selector").show();
        }
        else if (e.target.id === "edit-button") {
            $("#format-selector").show();
            $("#align-selector").hide();
        }
    });

    if (node_id)
        backend.fetchNotes(node_id).then(notes => {
            if (notes) {
                format = notes.format || "org";
                $("#notes-format").val(format === "html"? "delta": format);

                if (format === "html" || format === "delta")
                    initWYSIWYGEditor();
                else
                    initMarkupEditor();

                setEditorContent(notes.content);

                let content;
                if (format === "delta")
                    content = renderEditorContent();
                else
                    content = notes.content;
                formatNotes(content, format);

                if (format === "html")
                    format = "delta";

                align = notes.align;
                if (align)
                    $("#notes-align").val(align);
                alignNotes();

                if (format !== "delta" && format !== "text")
                    $("#inserts").show();
                else
                    $("#inserts").hide();
            }
        }).catch(e => {
            console.log(e)
        });

    $("#editor").on("input", editorSaveOnChange);
    $("#editor").on("blur", editorSaveOnBlur);

    $("#insert-example").on("click", e => {
        let edit = jQuery("#editor");
        let caretPos = edit[0].selectionStart;
        let textAreaText = edit.val();

        edit.val(textAreaText.substring(0, caretPos) + examples[format] + textAreaText.substring(caretPos));
        edit.trigger("input");
    });

    $("#insert-style").on("click", e => {
        let edit = jQuery("#editor");
        let caretPos = edit[0].selectionStart;
        let textAreaText = edit.val();

        edit.val(textAreaText.substring(0, caretPos) + styles[format] + textAreaText.substring(caretPos));
        edit.trigger("input");
    });

    $("#notes-format").on("change", e => {
        // old format
        if (format === "delta")
            $("#editor").val(quill.getHTML(true));

        format = $("#notes-format").val();

        // new format
        if (format === "delta") {
            initWYSIWYGEditor();
            quill.setHTML($("#editor").val());
        }
        else {
            closeWYSIWYGEditor();
        }

        if (format !== "delta" && format !== "text")
            $("#inserts").show();
        else
            $("#inserts").hide();

        saveNotes();
    });

    $("#notes-align").on("change", e => {
        align = $("#notes-align").val() === "left"? "left": undefined;
        alignNotes();
        backend.storeNotes(node_id, getEditorContent(), format, align);
    });

    $("#close-button").on("click", e => {
       if (window.parent) {
           window.parent.postMessage("SCRAPYARD_CLOSE_NOTES");
       }
    });

    if (inline) {
        $("#close-button").show();
    }

};
