import {scriptsAllowed, showNotification} from "./utils";
import {settings} from "./settings";
import {getMainMimeExt} from "./libs/mime.types";

var currTree;
var msg_hub = new MsgHub();

var windowId;


function withCurrTab(fn) {
    browser.tabs.query({currentWindow: true, active: true}).then(function (tabs) {
        fn.apply(null, [tabs[0]]);
    });
}


browser.windows.getCurrent({populate: true}).then((windowInfo) => {
    windowId = windowInfo.id;
});


function genItemId() {
    return new Date().format("yyyyMMddhhmmss");
}

function saveRdf() {
}

function getCurrContainer() {
    var $container;
    var $f = $(".item.focus");
    if ($f.length) {
        if ($f.hasClass("folder")) {
            $container = $f.next(".folder-content");
        } else {
            $container = $f.parent(".folder-content");
        }
    } else {
        $container = $(".root.folder-content");
    }
    return $container;
    ;
}

function getCurrRefId() {
    var $f = $(".item.focus");
    if ($f.length) {
        if (!$f.hasClass("folder")) {
            return $f.attr("id");
        }
    }
}

function requestUrlSaving(itemId) {
    withCurrTab(function (tab) {
        var icon = tab.favIconUrl;
        var ref_id;

        function Next() {
            var $container = null;
            var $f = $(".item.focus");
            if ($f.length) {
                if ($f.hasClass("folder")) {
                    $container = $f.next(".folder-content");
                } else {
                    ref_id = $f.attr("id");
                    $container = $f.parent(".folder-content");
                }
            } else {
                $container = $(".root.folder-content");
            }
            currTree.createLink(getCurrContainer(), "bookmark", itemId, getCurrRefId(), tab.url, icon, tab.title,
                false, true);
            saveRdf();
            showNotification({message: `Capture url "${tab.title}" done`, title: "Info"});
        }

        if (icon.match(/^data:image/i)) {
            var rdf_path = settings.getLastRdfPath();
            var filename = `${rdf_path}/data/${itemId}/favicon.ico`;
            $.post(settings.backend_url + "download", {url: icon, itemId: itemId, filename: filename}, function (r) {
                icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
                Next();
            })
        } else {
            Next();
        }
    });
}

function requestPageSaving(itemId, type) {
    withCurrTab(async function (tab) {
        var ico = "icons/loading.gif"
        try {
            if (!(await scriptsAllowed(tab.id))) {
                var err = "Content script is not allowed on this page";
                log.error(err)
                await showNotification({message: err, title: "Error"});
                return;
            }
            currTree.createLink(getCurrContainer(), "local", itemId, getCurrRefId(), tab.url, ico, tab.title,
                true, true);
            browser.tabs.sendMessage(tab.id, {type: type, itemId: itemId, windowId: windowId}, null);
        } catch (e) {
            log.error(e.message)
        }
    });
}

function updateMenuItem(t) {
    browser.contextMenus.removeAll(function () {
        browser.contextMenus.create({
            id: "catch", title: `catch ${t}`, onclick: function () {
            }
        });
    });
}

function withFocusedWindow(callback) {
    browser.windows.getLastFocused().then((win) => callback(win));
}

// /* receive message from background page */
// browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
//     if (request.type == 'UPDATE_CONTEXTMENU_REQUEST') {
//
//     } else if (request.type == 'SAVE_CONTENT2') {
//         savePage2(request.path, request.title, request.content);
//     } else if (request.type == 'SAVE_CONTENT' && request.windowId == windowId) {
//         savePage(request.itemId, request.content.title, request.content.html,
//             request.content.css, request.content.res, function () {
//                 browser.tabs.sendMessage(sender.tab.id, {
//                     type: 'SAVE_CONTENT_FINISHED',
//                     itemId: request.itemId,
//                     title: request.content.title
//                 }, null);
//             });
//     } else if (request.type == 'GET_OTHER_INSTANCE_REQUEST') {
//         browser.runtime.sendMessage({session_id: request.session_id});
//     } else if (request.type == 'RDF_EDITED') {
//         if (request.content.rdf == currTree.rdf) {
//             alert("{Warning}", "{SAME_RDF_MODIFIED}").then(function (r) {
//                 //loadXml(currTree.rdf);
//             });
//         }
//     } else if (request.type == 'SAVE_PAGE_SELECTION_REQUEST') {
//         if (currTree && currTree.rendered) {
//             withFocusedWindow(function (win) {
//                 if (win.id == windowId)
//                     requestPageSaving(genItemId(), 'GET_PAGE_SELECTION_REQUEST');
//             });
//         } else {
//             log.error("rdf have not been loaded")
//         }
//     } else if (request.type == 'SAVE_PAGE_REQUEST') {
//         if (currTree && currTree.rendered) {
//             withFocusedWindow(function (win) {
//                 if (win.id == windowId) {
//                     requestPageSaving(genItemId(), 'GET_PAGE_REQUEST');
//                 }
//             });
//         } else {
//             log.error("rdf have not been loaded")
//         }
//     } else if (request.type == 'SAVE_URL_REQUEST') {
//         if (currTree && currTree.rendered) {
//             withFocusedWindow(function (win) {
//                 if (win.id == windowId)
//                     requestUrlSaving(genItemId());
//             });
//         } else {
//             log.error("rdf have not been loaded")
//         }
//     }
// });
// msg_hub.send('GET_OTHER_INSTANCE_REQUEST', '', function (response) {
//     // alert("Warning", "Found another window")
// });

function postBlob(url, blob, filename, itemId, onload, onerror) {
    var rdf_path = currTree.rdf_path;
    var formData = new FormData();
    formData.append("filename", `${rdf_path}/data/${itemId}/${filename}`);
    formData.append("file", blob);   // add file object
    var request = new XMLHttpRequest();
    request.open("POST", url, false);
    // request.responseType='text';
    request.onload = function (oEvent) {
        onload && onload();
    };
    request.onerror = function (oEvent) {
        onerror && onerror();
    };
    request.send(formData);
}

function savePage(itemId, title, content, css, res, callback) {
    var finished = 0, all = 0;
    $.each(res, function (i, item) {
        if (item.blob) all++;
    });
    $.each(res, function (i, item) {
        if (item.blob) {
            var ext = getMainMimeExt(item.blob.type) || "";
            var reg = new RegExp(item.hex, "g")
            if (item.hex) content = content.replace(reg, item.hex + ext);
            postBlob(settings.backend_url + "savebinfile", item.blob, item.filename || (item.hex + ext),
                itemId, function () {
                    if (++finished == all) {
                        content = ['<!Doctype html>', content,].join("\n");
                        var rdf_path = currTree.rdf_path;
                        $.post(settings.backend_url + "savefile", {
                            filename: `${rdf_path}/data/${itemId}/index.html`,
                            content: content
                        }, function (r) {
                            $.post(settings.backend_url + "savefile", {
                                filename: `${rdf_path}/data/${itemId}/index.css`,
                                content: css,
                                folder: settings.getLastRdfPath() + "data/" + itemId
                            }, function (r) {
                                /** update the icon */
                                var icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
                                $("#" + itemId).removeAttr("disabled");
                                currTree.updateItemIcon($("#" + itemId), icon);
                                /** save xml file when all files uploaded */
                                saveRdf();
                                showNotification({message: `Capture content of "${title}" done`, title: "Info"});
                                callback && callback();
                            });
                        });
                    }
                }, function () {
                    // error
                });
        }
    });
}

function savePage2(path, title, content) {
    $.post(settings.backend_url + "savefile", {filename: `${path}/index.html`, content: content}, function (r) {
        showNotification({message: `Save content of "${title}" done`, title: "Info"});
    });
}

