import {fetchText} from "../utils_io.js";
import {send} from "../proxy.js";
import * as org from "../lib/org/org.js"
import {NODE_TYPE_NOTES} from "../storage.js";
import {markdown2html, org2html, text2html} from "../notes_render.js";
import {systemInitialization} from "../bookmarks_init.js";
import {Node, Notes} from "../storage_entities.js";
import {PlainTextEditor, WYSIWYGEditor} from "./notes_editor.js";

const INPUT_TIMEOUT = 3000;
const DEFAULT_WIDTH = "790px";
const DEFAULT_FONT_SIZE = 120;

let examples;
const styles = {"org": `#+CSS: p {text-align: justify;}`,
                "markdown": `[//]: # (p {text-align: justify;})`};

const NODE_ID = parseInt(location.hash?.split(":")?.pop());

let format = "delta";
let align;
let width;

let editor;
let editorChanged;
let editorTimeout;

$(init);

async function init() {
    await systemInitialization;

    const isInline = location.search.startsWith("?i");

    if (isInline)
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


    try {
        let node = await Node.get(NODE_ID);
        let sourceURL = $("#source-url");
        sourceURL.text(node.name);

        if (node.type === NODE_TYPE_NOTES) {
            sourceURL.removeClass("source-url");
            sourceURL.addClass("notes-title");
            $("title").text(node.name);
        }
        else {
            $("title").text("Notes for: " + node.name);
            $("#notes-for").show();
        }

        if (node.type !== NODE_TYPE_NOTES)
            sourceURL.on("click", e => {
                send.browseNode({node: node});
            });

        let notes = await Notes.get(node);
        if (notes) {
            format = notes.format || "org";
            $("#notes-format").val(format === "html"? "delta": format);

            editor = createEditor(format);
            editor.setContent(notes.content);
            formatNotes(editor.renderContent(), format);

            if (format === "html")
                format = "delta";

            align = notes.align;
            if (align)
                $("#notes-align").val(align);
            alignNotes();

            width = notes.width;
            if (width) {
                //$("#notes").css("width", width);

                let selected;
                $("#notes-width option").each(function() {
                    if (width === this.textContent)
                        selected = this.value;
                });

                if (selected) {
                    $("#notes-width").val(selected);
                    $("#notes").css("width", width);
                }
                else {
                    let actualWidthElt = $("#notes-width option[value='actual']");
                    actualWidthElt.show();
                    actualWidthElt.text(width);
                    $("#notes-width").val("actual");
                    $("#notes").css("width", width);
                }
            }

            if (format !== "delta" && format !== "text")
                $("#inserts").show();
            else
                $("#inserts").hide();
        }
        else {
            editor = createEditor();
        }
    }
    catch (e) {
        console.error(e)
    }

    $("#tabbar a").on("click", e => {
        e.preventDefault();

        $("#tabbar a").removeClass("focus");
        $(e.target).addClass("focus");

        $(`.content`).hide();
        $(`#content-${e.target.id}`).css("display", "flex");

        if (e.target.id === "notes-button") {
            formatNotes(editor.renderContent(), format);
            $("#format-selector").hide();
            $("#align-selector").show();
        }
        else if (e.target.id === "edit-button") {
            $("#format-selector").show();
            $("#align-selector").hide();
        }
    });

    $("#insert-example").on("click", async e => {
        let edit = jQuery("#editor");
        let caretPos = edit[0].selectionStart;
        let textAreaText = edit.val();

        await initExamples();

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
        if (format === "delta" && !editor.isEmpty())
            $("#editor").val(editor.getContent());

        format = $("#notes-format").val();

        editor.uninstall();
        editor = createEditor(format);

        // new format
        if (format === "delta")
            editor.setContent($("#editor").val());

        if (format !== "delta" && format !== "text") {
            $("#inserts").show();
            $("#editor-font-sizes").hide();
        }
        else {
            $("#inserts").hide();
            if (format === "delta")
                $("#editor-font-sizes").show();
        }

        send.storeNotes({options: {node_id: NODE_ID, format}, property_change: true});
    });

    $("#notes-align").on("change", e => {
        align = $("#notes-align").val();
        alignNotes();
        send.storeNotes({options: {node_id: NODE_ID, align}, property_change: true});
    });

    $("#notes-width").on("change", e => {
        let selectedWidth = $("#notes-width option:selected").text();
        switch ($("#notes-width").val()) {
            case "custom":
                let customWidth = prompt("Custom width: ", "650px");
                if (customWidth) {
                    if (/^\d+$/.test(customWidth))
                        customWidth = customWidth + "px";

                    let actualWidthElt = $("#notes-width option[value='actual']");
                    actualWidthElt.show();
                    actualWidthElt.text(customWidth);
                    width = customWidth;
                    $("#notes-width").val("actual");
                    $("#notes").css("width", width);
                }
                break;
            case "default":
                $("#notes").css("width", DEFAULT_WIDTH);
                width = null;
                break;
            default:
                $("#notes").css("width", selectedWidth);
                width = selectedWidth;
        }

        send.storeNotes({options: {node_id: NODE_ID, width}, property_change: true});
    });

    $("#decrease-width").on("click", e => changeWidth("dec"));
    $("#increase-width").on("click", e => changeWidth("inc"));

    $("#font-size-larger").on("click", e => {
        changeFontSize("notes-font-size", "#notes", (a, b) => a + b);
    });

    $("#font-size-smaller").on("click", e => {
        changeFontSize("notes-font-size", "#notes", (a, b) => a - b);
    });

    $("#font-size-default").on("click", e => {
        localStorage.setItem("notes-font-size", DEFAULT_FONT_SIZE);
        $("#notes").css("font-size", DEFAULT_FONT_SIZE + "%");
    });

    $("#editor-font-size-larger").on("click", e => {
        changeFontSize("editor-font-size", ".ql-container", (a, b) => a + b);
    });

    $("#editor-font-size-smaller").on("click", e => {
        changeFontSize("editor-font-size", ".ql-container", (a, b) => a - b);
    });

    $("#editor-font-size-default").on("click", e => {
        localStorage.setItem("editor-font-size", DEFAULT_FONT_SIZE);
        $(".ql-container").css("font-size", DEFAULT_FONT_SIZE + "%");
    });

    let fontSize = parseInt(localStorage.getItem("notes-font-size") || DEFAULT_FONT_SIZE);
    $("#notes").css("font-size", fontSize + "%");

    $("#close-button").on("click", e => {
        if (window.parent) {
            window.parent.postMessage("SCRAPYARD_CLOSE_NOTES");
        }
    });

    if (isInline) {
        $("#close-button").show();
    }

    $("#notes").on("click", "a[href^='org-protocol://']", e => {
        e.preventDefault();
        send.browseOrgReference({link: e.target.href});
    });
};

window.onbeforeunload = function() {
    if (editorChanged)
        return true;
};

function createEditor(format = "delta") {
    let editor;

    if (format === "html" || format === "delta") {
        const fontSize = parseInt(localStorage.getItem("editor-font-size") || DEFAULT_FONT_SIZE);
        editor = new WYSIWYGEditor(format, fontSize);
    }
    else
        editor = new PlainTextEditor(format);

    editor.setChangeHandler(() => {
        editorChanged = true;
        editorSaveOnChange(true);
    })
    editor.setBlurHandler(() => editorSaveOnBlur(true));
    editor.setSaveHandler(() => saveNotes());

    return editor;
}

async function initExamples() {
    if (!examples) {
        examples = {"org": await fetchText("notes_example_org.txt"),
                    "markdown": await fetchText("notes_example_md.txt")};
    }
}

function saveNotes() {
    let options = {node_id: NODE_ID, content: editor.getContent(), format, align, width};
    if (format === "delta")
        options.html = editor.renderContent();

    send.storeNotes({options});
    send.notesChanged({node_id: NODE_ID, removed: !options.content});
    editorChanged = false;
}

function editorSaveOnChange(e) {
    clearTimeout(editorTimeout);

    editorTimeout = setTimeout(() => {
        if (e && NODE_ID) {
            saveNotes();
        }
    }, INPUT_TIMEOUT);
}

function editorSaveOnBlur(e) {
    if (e && NODE_ID) {
        clearTimeout(editorTimeout);
        saveNotes();
    }
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
            $("#notes").attr("class", "notes format-html").html(text);
            break;
        default:
            $("#notes").attr("class", "notes format-text").html(text2html(text));;
    }
}

function alignNotes() {
    switch (align) {
        case "left":
            $("#space-left").css("flex", "0");
            $("#space-right").css("flex", "1");
            break;
        case "right":
            $("#space-right").css("flex", "0");
            $("#space-left").css("flex", "1");
            break;
        default:
            $("#space-left").css("flex", "1");
            $("#space-right").css("flex", "1");
    }
}

function changeWidth(op) {
    let newWidth;
    let selectedWidth = $("#notes-width option:selected").text();
    let actualWidthElt = $("#notes-width option[value='actual']");
    let match = /(\d+)(.*)/.exec(selectedWidth);

    let [_, value, units] = (match || [null, "inc"? "800": "700", "px"]);

    const step = units === "%"? 10: 50;
    newWidth = parseInt(value);
    newWidth = op === "inc"? newWidth + step: newWidth - step;
    let pass = units === "%"? newWidth >= 10 && newWidth <= 100: newWidth >= 100 && newWidth <= 4000;

    if (pass) {
        width = newWidth = newWidth + units;
        actualWidthElt.text(newWidth);
        actualWidthElt.show();
        $("#notes-width").val("actual");
        $("#notes").css("width", newWidth);
        send.storeNotes({options: {node_id: NODE_ID, width: newWidth}, property_change: true});
    }
}

function changeFontSize(setting, target, op) {
    let size = parseInt(localStorage.getItem(setting) || DEFAULT_FONT_SIZE);
    size = op(size, 5);
    localStorage.setItem(setting, size);
    $(target).css("font-size", size + "%");
}
