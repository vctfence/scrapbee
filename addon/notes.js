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

let TEXT_EXAMPLE = `CSS: #notes {width: 100%}
This is an example of a plain text with added CSS style. The style should be added on the first line of the text to have effect.

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam ligula lorem, porttitor non dictum vel, euismod et urna. Nulla feugiat, erat a semper mollis, massa felis consequat nunc, sit amet venenatis magna felis quis leo. Nunc velit risus, eleifend at lacinia id, fringilla et ipsum. Cras nulla ante, posuere eget ultricies non, ornare eget lectus. Nulla ac posuere elit, in interdum turpis. Suspendisse potenti. Pellentesque tempus nec quam vel imperdiet. In interdum libero lorem, vitae tempus libero pretium vitae. Integer accumsan, risus nec tempor aliquam, leo enim tempus felis, eget facilisis arcu lectus et arcu. Nam consequat lectus et fringilla tristique. Nulla facilisi. Aliquam vulputate, ipsum et dictum aliquam, tellus sem eleifend velit, et sodales dolor nisl et magna. Quisque eu elementum neque. Nam sodales justo tortor, at cursus enim egestas ac. In semper hendrerit augue ac suscipit. Proin ut laoreet diam.

Etiam sagittis metus sed orci iaculis gravida. Nam fringilla imperdiet turpis sed pretium. Nam scelerisque mauris non arcu vulputate, sit amet iaculis orci aliquet. Donec accumsan erat lacus, vitae aliquam elit porta sed. Maecenas nec justo ultrices, ultricies tortor ullamcorper, finibus lorem. Nullam sit amet congue tortor. Vestibulum euismod magna sit amet risus rhoncus, vel placerat arcu tincidunt. Vestibulum dictum pharetra dui, sit amet malesuada mauris ullamcorper a. Vestibulum nulla massa, tempor dignissim risus sit amet, tincidunt finibus lacus.`

let TEXT_DEFAULT_STYLE = `CSS: #notes {width: 100%}`;

const INPUT_TIMEOUT = 5000;

let examples = {"org": ORG_EXAMPLE, "markdown": MD_EXAMPLE, "text": TEXT_EXAMPLE};
let styles = {"org": ORG_DEFAULT_STYLE, "markdown": MD_DEFAULT_STYLE, "text": TEXT_DEFAULT_STYLE};

let node_ids = location.hash? location.hash.split(":"): [];
let node_id = node_ids.length? parseInt(node_ids[node_ids.length - 1]): undefined;
//let node_uuid = node_ids.length? node_ids[0].substring(1): undefined;
let inline = location.href.split("?");
inline = inline.length > 1 && inline[1].startsWith("i#");

let format = "html";
let align;

let wysiwyg;

let editorTimeout;

function editorSaveOnChange(e) {
    clearTimeout(editorTimeout);

    editorTimeout = setTimeout(() => {
        if (e && node_id) {
            backend.storeNotes(node_id, getEditorContent(), format, align);
            browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !getEditorContent()});
        }
    }, INPUT_TIMEOUT);
}

function editorSaveOnBlur(e) {
    if (e && node_id) {
        clearTimeout(editorTimeout);
        backend.storeNotes(node_id, getEditorContent(), format, align);
        browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !getEditorContent()});
    }
}

function initWYSIWYG() {
    let editor = $('#editor').trumbowyg({
        autogrow: false,
        btns: [
            ['viewHTML'],
            ['formatting'],
            ['fontfamily'],
            ['fontsize'],
            //['lineheight'],
            ['strong', 'em', 'underline'],
            ['foreColor', 'backColor'],
            ['superscript', 'subscript'],
            ['link'],
            ['insertImage', 'base64'],
            ['justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'],
            ['horizontalRule'],
            ['indent', 'outdent'],
            ['unorderedList', 'orderedList'],
            ['table'],
            ['removeformat']
        ]
    });

    if (!wysiwyg) {
        editor.on('tbwchange', editorSaveOnChange)
        editor.on('tbwblur', editorSaveOnBlur);
    }

    wysiwyg = true;
}

function clearWYSIWYG() {
    $('#editor').trumbowyg('destroy');
}

function getEditorContent() {
    if (format === "html")
        return $('#editor').trumbowyg("html");
    else
        return $('#editor').val();
}

function setEditorContent(content) {
    if (format === "html") {
        console.log(content);
        $('#editor').trumbowyg("html", content);
        console.log($('#editor').trumbowyg("html"));
    }
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
            browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !getEditorContent()});

            $("#format-selector").hide();
            $("#align-selector").show();
            //$("#full-width-container").show()
            formatNotes(getEditorContent(), format);
        }
        else if (e.target.id === "edit-button") {
            $("#format-selector").show();
            $("#align-selector").hide();

            //$("#full-width-container").hide();
        }
    });

    if (node_id)
        backend.fetchNotes(node_id).then(notes => {
            if (notes) {
                format = notes.format || "org";
                $("#notes-format").val(format);

                if (format === "html")
                    initWYSIWYG();

                setEditorContent(notes.content);

                align = notes.align;
                if (align)
                    $("#notes-align").val(align);
                alignNotes();

                if (format !== "html")
                    $("#inserts").show();
                else
                    $("#inserts").hide();

                formatNotes(notes.content, format);
            }
        }).catch(e => {
            console.log(e)
        });

    $("#editor").on("input", editorSaveOnChange);
    $("#editor").on("blur", editorSaveOnBlur);

    // $("#full-width").on("change", e => {
    //     if ($("#full-width").is(":checked")) {
    //         $("#notes").attr("style", "width: 100%");
    //     }
    //     else {
    //         $("#notes").removeAttr("style");
    //     }
    // });

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
        format = $("#notes-format").val();

        if (format === "html")
            initWYSIWYG();
        else
            clearWYSIWYG();

        if (format !== "html")
            $("#inserts").show();
        else
            $("#inserts").hide();

        backend.storeNotes(node_id, getEditorContent(), format, align);
        browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !getEditorContent()})
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
