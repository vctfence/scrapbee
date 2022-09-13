import {NODE_TYPE_NOTES} from "../storage.js";
import {formatBytes} from "../utils.js";

const DEFAULT_CONTAINER = "--default-container";

function showDlg(name, data, callback) {
    if ($(".dlg-cover:visible").length)
        return
    let $dlg = $(".dlg-cover.dlg-" + name).clone().prependTo(document.body);

    if (data.width)
        $dlg.find(".dlg").css("width", data.width);

    if (data.wrap)
        $dlg.find(".dlg-table .row").css("white-space", "normal");

    $dlg.show();

    if (name === "prompt")
        setTimeout(() => $("input.dialog-input", $dlg).focus());

    data = data || {}
    $dlg.html($dlg.html().replace(/\[([^\[\]]+?)\]/g, function (a, b) {
        return data[b] || ""
    }));
    $dlg.find("input").each(function () {
        if (this.name) {
            if (this.type === "radio") {
                if (this.value == data[this.name])
                    this.checked = true;
            } else {
                if (typeof data[this.name] != "undefined" && !(this.name === "icon" && data["icon"]?.startsWith("var(")))
                    this.value = data[this.name];
            }
        }
    });
    $dlg.find("textarea").each(function () {
        if (typeof data[this.name] != "undefined")
            this.value = data[this.name];
    });

    // fill in object size
    if (data.size) {
        let size = $dlg.find("#prop-size");
        size.text(formatBytes(data.size));
    }

    $dlg.find("input.button-ok").unbind(".dlg");
    $dlg.find("input.button-cancel").unbind(".dlg");
    //$dlg.find("input.dialog-input").first().focus();

    $(".more-properties", $dlg).hide();

    // handle bookmark comments
    let comments_icon = $dlg.find("#prop-dlg-comments-icon").first();
    if (comments_icon.length) {
        let comments_container = $dlg.find(" #dlg-comments-container").first();
        let dlg_title = $dlg.find(" #prop-dlg-title-text").first();

        if (data.comments) {
            comments_icon.css("background-image", "var(--themed-comments-filled-icon)");
        }
        else
            comments_icon.css("background-image", "var(--themed-comments-icon)");

        let old_icon = comments_icon.css("background-image");

        comments_icon.click(e => {
            comments_container.toggle();
            if (comments_container.is(":visible")) {
                comments_icon.css("background-image", "var(--themed-properties-icon)");
                comments_icon.attr("title", "Properties");
                dlg_title.text("Comments");
            }
            else {
                comments_icon.css("background-image", old_icon);
                comments_icon.attr("title", "Comments");
                dlg_title.text("Properties");
            }
        });
    }

    // handle bookmark containers
    let containers_icon = $dlg.find("#prop-dlg-containers-icon").first();
    if (browser.contextualIdentities && containers_icon.length && data.type !== NODE_TYPE_NOTES) {
        containers_icon.click(() => {
            $("#containers-menu", $dlg).toggle();
        });

        let containers_menu = $dlg.find("#containers-menu").first();
        let icon_style = `background-image: var(--themed-containers-icon); background-size: 15px 15px;`
                       + `background-repeat: no-repeat; background-position: center; background-color: transparent !important`;
        let container_item = `<div class="container-item" id="${DEFAULT_CONTAINER}"><i class="container-icon" style='${icon_style}'></i>`
            + `Default</div>`;

        containers_menu.append(container_item);

        if (data.containers)
            for (let container of data.containers) {
                icon_style = `mask-image: url("${container.iconUrl}"); mask-size: contain; `
                    + `mask-repeat: no-repeat; mask-position: center; background-color: ${container.colorCode} !important;`

                container_item = `<div class="container-item" id="${container.cookieStoreId}">`
                               +`<i class="container-icon" style='${icon_style}'></i>${container.name}</div>`;

                containers_menu.append(container_item);
            }

        let makeButtonStyle = (elt) => {
            let style = $("i", elt).attr("style") + "background-image: none; ";

            if (elt.id !== DEFAULT_CONTAINER)
                style += " margin-top: 0;"

            return style;
        }

        $(".container-item").click(e => {
            containers_icon.attr("style", makeButtonStyle(e.target));
            data.container = e.target.id;

            if (data.container === DEFAULT_CONTAINER)
                data.container = null;
        });

        if (data.container && data.container !== DEFAULT_CONTAINER) {
            let elt = $(`#${data.container}`, containers_menu).get(0);
            if (elt)
                containers_icon.attr("style", makeButtonStyle(elt));
        }
    }
    else {
        containers_icon.remove();
    }


    /** return promise object */
    let p = new Promise(function (resolve, reject) {
        function proceed() {
            var data = {};
            $dlg.find("input").each(function () {
                if (this.name) {
                    if (this.type == "radio") {
                        if (this.checked)
                            data[this.name] = $(this).val();
                    } else {
                        data[this.name] = $(this).val();
                    }
                }
            })
            $dlg.find("textarea").each(function () {
                if (this.name)
                    data[this.name] = $(this).val();
            })
            $dlg.remove();
            resolve(data);
            // callback && callback(data);
        }

        $dlg.find("input.button-ok").bind("click.dlg", proceed);
        $dlg.find("input.dialog-input").bind("keydown.dlg", ev => {
            if (ev.key == "Enter")
                proceed()
            if (ev.key == "Escape")
                $dlg.remove();
        });
        $dlg.find("input.button-cancel").bind("click.dlg", function () {
            $dlg.remove();
            resolve(null);
        });

        let more_properties = $dlg.find("#more-properties");

        more_properties.bind("click.dlg", function () {
            if (more_properties.text() === "More") {
                let fields = $(".more-properties");

                // hide the icon filed, if there is a stored icon or no icon
                // hide size, if it is empty
                fields = fields.filter(function() {
                    if (!["prop-row-icon", "prop-row-size"].some(id => this.id === id))
                        return true;

                    if (this.id === "prop-row-icon" && !data.stored_icon && data.icon && data.type !== NODE_TYPE_NOTES)
                        return true;

                    if (this.id === "prop-row-size" && data.size)
                        return true;

                    return false;
                });

                fields.show();
                more_properties.text("Less");
            }
            else {
                $(".more-properties").hide();
                more_properties.text("More");
            }
        });

        let set_default_icon = $dlg.find("#set-default-icon");

        set_default_icon.bind("click.dlg", function () {
            $dlg.find("#prop-icon").val("");
        });

        let copy_reference = $dlg.find("#copy-reference-url");

        copy_reference.bind("click.dlg", function () {
            let url = "ext+scrapyard://" + $dlg.find("#prop-uuid").val();
            navigator.clipboard.writeText(url);
        });
    });
    return p;
}

function alert(title, message) {
    return showDlg("alert", {title, message});
}

function confirm(title, message) {
    return showDlg("confirm", {title, message});
}


export {showDlg, alert, confirm}
