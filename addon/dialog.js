
function showDlg(name, data, callback) {
    if ($(".dlg-cover:visible").length)
        return
    let $dlg = $(".dlg-cover.dlg-" + name).clone().appendTo(document.body);
    $dlg.show();
    data = data || {}
    $dlg.html($dlg.html().replace(/\[([^\[\]]+?)\]/g, function (a, b) {
        return data[b] || ""
    }));
    $dlg.find("input").each(function () {
        if (this.name) {
            if (this.type == "radio") {
                if (this.value == data[this.name])
                    this.checked = true;
            } else {
                if (typeof data[this.name] != "undefined" && !(this.name === "icon" && data["icon"].startsWith("var(")))
                    this.value = data[this.name];
            }
        }
    });
    $dlg.find("input.button-ok").unbind(".dlg");
    $dlg.find("input.button-cancel").unbind(".dlg");
    $dlg.find("input.dialog-input").first().focus();

    $(".more-properties").hide();

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
        });

        let more_properties = $dlg.find("#more-properties");

        more_properties.bind("click.dlg", function () {
            if (more_properties.text() === "More") {
                $(".more-properties").show();
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

    });
    return p;
}

function alert(title, message) {
    return showDlg("alert", {title: title.translate(), message: message.translate()});
}

function confirm(title, message) {
    return showDlg("confirm", {title: title.translate(), message: message.translate()});
}


export {showDlg, alert, confirm}
