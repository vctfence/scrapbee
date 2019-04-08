import {backend} from "./backend.js"
import * as org from "./org.js"
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES} from "./db.js";

const INPUT_TIMEOUT = 1000;

let ORG_EXAMPLE = `#+OPTIONS: toc:t num:nil
#+CSS: #notes {width: 600px;} p {text-align: justify;}

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
`


window.onload = function() {
    let node_ids = location.hash? location.hash.split(":"): [];
    let node_id = node_ids.length? parseInt(node_ids[node_ids.length - 1]): undefined;
    //let node_uuid = node_ids.length? node_ids[0].substring(1): undefined;
    let inline = location.href.split("?");
    inline = inline.length > 1 && inline[1].startsWith("i#");

    if (inline)
        $("#tabbar").html(`<a id="notes" class="focus" href="#">Notes</a>
                                 <a id="edit" href="#">Edit</a>`);
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

        source_url.on("click", e => {
            browser.runtime.sendMessage({type: "BROWSE_NODE", node: node});
        });
    });

    function org2html(org_text) {
        let doc = new org.Parser().parse(org_text);
        let html = new org.ConverterHTML(doc).result;

        let output = "";

        if (doc.directiveValues["css:"])
            output += `<style>${doc.directiveValues["css:"]}</style>`

        if (doc.options.toc) {
            output += html.tocHTML.replace("<ul", "<ul id='toc'") + html.contentHTML;
        }
        else
            output += html.contentHTML;

        return output;
    }

    $("#tabbar a").on("click", e => {
        e.preventDefault();

        $("#tabbar a").removeClass("focus");
        $(e.target).addClass("focus");

        $(`.content`).hide();
        $(`#content-${e.target.id}`).show();

        if (e.target.id === "notes-button") {
            $("#insert-example").hide();
            //$("#full-width-container").show()
            $("#notes").html(org2html($("#editor").val()));
        }
        else if (e.target.id === "edit-button") {
            $("#insert-example").show();
            //$("#full-width-container").hide();
        }
    });

    if (node_id)
        backend.fetchNotes(node_id).then(notes => {
            if (notes) {
                $("#editor").val(notes.content);
                $("#notes").html(org2html(notes.content));
            }
        }).catch(e => {
            console.log(e)
        });

    let timeout;
    $("#editor").on("input", e => {
        clearTimeout(timeout);

        timeout = setTimeout(() => {
            if (node_id && e.target.value)
                backend.storeNotes(node_id, e.target.value);
        }, INPUT_TIMEOUT);
    });

    $("#editor").on("blur", e => {
        if (node_id && e.target.value)
            backend.storeNotes(node_id, e.target.value);
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

        edit.val(textAreaText.substring(0, caretPos) + ORG_EXAMPLE + textAreaText.substring(caretPos));
        edit.trigger("input");
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
