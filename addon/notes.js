import {backend} from "./backend.js"
import * as org from "./org.js"
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES} from "./db.js";

const INPUT_TIMEOUT = 1000;

let ORG_EXAMPLE = `#+OPTIONS: toc:t num:nil
#+CSS: .notes {width: 600px;} p {text-align: justify;}

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

let ORG_DEFAULT_STYLE = `#+CSS: .notes {width: 600px;} p {text-align: justify;}`;

let MD_EXAMPLE = `[//]: # (.notes {width: 600px;} p {text-align: justify;})

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

let MD_DEFAULT_STYLE = `[//]: # (.notes {width: 600px;} p {text-align: justify;})`;

let examples = {"org": ORG_EXAMPLE, "markdown": MD_EXAMPLE};
let styles = {"org": ORG_DEFAULT_STYLE, "markdown": MD_DEFAULT_STYLE};


window.onload = function() {
    let node_ids = location.hash? location.hash.split(":"): [];
    let node_id = node_ids.length? parseInt(node_ids[node_ids.length - 1]): undefined;
    //let node_uuid = node_ids.length? node_ids[0].substring(1): undefined;
    let inline = location.href.split("?");
    inline = inline.length > 1 && inline[1].startsWith("i#");
    let format = "text";

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
        let lines = md_text.split("\n");
        let comment = lines.length? lines[0].trim(): "";
        let matches = /\[\/\/]: # \((.*?)\)$/.exec(comment);

        if (matches && matches[1])
            $("#notes-style").text(matches[1].htmlEncode(true, true));
        else
            $("#notes-style").text("");

        return marked(md_text);
    }

    function formatNotes(text, format) {
        switch (format) {
            case "org":
                $("#notes").attr("class", "notes format-org").html(org2html(text));

                break;
            case "markdown":
                $("#notes").attr("class", "notes format-markdown").html(markdown2html(text));
                break;
            default:
                $("#notes").attr("class", "notes format-text")
                    .html(`<pre class="plaintext">${text.htmlEncode()}</pre>`);
        }
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
        $(`#content-${e.target.id}`).show();

        if (e.target.id === "notes-button") {
            browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !$("#editor").val()});

            $("#format-selector").hide();
            //$("#full-width-container").show()
            formatNotes($("#editor").val(), format);
        }
        else if (e.target.id === "edit-button") {
            $("#format-selector").show();
            //$("#full-width-container").hide();
        }
    });

    if (node_id)
        backend.fetchNotes(node_id).then(notes => {
            if (notes) {
                $("#editor").val(notes.content);

                format = notes.format? notes.format: "org";
                $("#notes-format").val(format);

                if (format !== "text")
                    $("#inserts").show();
                else
                    $("#inserts").hide();

                formatNotes(notes.content, format);
            }
        }).catch(e => {
            console.log(e)
        });

    let timeout;
    $("#editor").on("input", e => {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
            if (node_id) {
                backend.storeNotes(node_id, e.target.value, format);
            }
        }, INPUT_TIMEOUT);
    });

    $("#editor").on("blur", e => {
        if (node_id) {
            backend.storeNotes(node_id, e.target.value, format);
            browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !e.target.value});
        }
    });

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
        if (format !== "text")
            $("#inserts").show();
        else
            $("#inserts").hide();

        backend.storeNotes(node_id, $("#editor").val(), format);
        browser.runtime.sendMessage({type: "NOTES_CHANGED", node_id: node_id, removed: !$("#editor").val()})
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
