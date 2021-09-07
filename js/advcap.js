import {Configuration, History} from "./storage.js"
import {BookTree} from "./tree.js"
import {log} from "./message.js"
import {genItemId, refreshTree} from "./utils.js"

var currTree;
var conf = new Configuration();
var history = new History();

function loadXml(rdf, $box){
    return new Promise((resolve, reject) => {
        // $("#path-box bdi").empty();
        $("input[type=button]").prop("disabled", true);
        $box.empty().text("loading...");
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.onload = async function(r) {
	    currTree = new BookTree(r.target.response, rdf, {lockDraging: true});
	    await currTree.renderTree($box, true);
            // currTree.toggleFolder(currTree.getItemById("root"), true);
            currTree.onChooseItem = function(itemId) {
                var t = currTree.getItemPath(currTree.getItemById(itemId));
                $("#path-box bdi").html(t);
	    }
            $("input[type=button]").prop("disabled", false);
            /** restore status */
            if(conf.getItem("capture.adv.tree.last") == rdf){
                var folders = conf.getItem("capture.adv.tree.folders.opened");
                var focused = conf.getItem("capture.adv.tree.focused.last");
                
                if(folders){
                    folders.split(",").forEach(function(id){
                        currTree.toggleFolder(currTree.getItemById(id), true);
                    });
                }
                if(focused){
                    var $item = currTree.getItemById(focused);
                    currTree.focusItem($item);
                    currTree.scrollToItem($item, 500, $(".toolbar").height() + 5, false);
                    currTree.onChooseItem(focused);
                }
            }
            resolve(currTree);
        };
        xmlhttp.onerror = function(err) {
	    log.info(`load ${rdf} failed, ${err}`);
        };

        var addr = conf.getFileServiceAddress();
        xmlhttp.open("GET", `${addr}/${rdf}`, false);
        xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
        xmlhttp.setRequestHeader('cache-control', 'max-age=0');
        xmlhttp.setRequestHeader('expires', '0');
        xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
        xmlhttp.setRequestHeader('pragma', 'no-cache');
        xmlhttp.send();
    });
}

$(document).ready(async function(){
    await conf.load();
    await history.load();

    document.body.innerHTML = document.body.innerHTML.translate();
    // function randRange(a, b){
    //     return Math.floor(Math.random() * (b-a+1)) + a;
    // }
    // function genItemId(){
    //     return new Date().format("yyyyMMddhhmmssS" + String(randRange(1,999999)).padStart(6, "0"));
    // }
    $("input[type=button]").prop("disabled", true);
    /** add folder */
    var button = document.body.querySelector("#btnAddFoder");
    button.onclick=function(){
        var title = prompt("Please input name of new folder");
        if(!title) return;

        var pos = conf.getItem("capture.behavior.item.new.pos");
        currTree.createFolder(currTree.getCurrContainer(), genItemId(), currTree.getCurrRefId(), title, true, pos);
        browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(),
                                     path: currTree.rdf, backup:true, boardcast:true, srcToken: currTree.unique_id}).then((response) => {});
    }
    /** toggle root */
    $("#show-root").change(function(){
        currTree.showRoot(this.checked)
    });
    /** cancle capture */
    var button = document.body.querySelector("#btnCancel");
    button.onclick=function(){
        browser.runtime.sendMessage({type: 'TAB_INNER_CALL', dest: "CONTENT_PAGE", action: "CANCEL_CAPTURE"}).then((response) => {});
    }
    /** start capture */
    var button = document.body.querySelector("#btnCapture");
    button.onclick = function(){
        var saveType = document.body.querySelector("input[type=radio][name=save_type]:checked").value;
        var nodeType = saveType == "SAVE_URL" ? "bookmark" : "page";
        var itemId = genItemId();
        var title = document.body.querySelector("#txTitle").value;
        // var tags = document.body.querySelector("#txTags").value;
        var url = document.body.querySelector("#txUrl").value;
        var rdfPath = currTree.rdfPath; // document.body.querySelector("#lstRdfs").value;
        var rdf = currTree.rdf;
        var refId = currTree.getCurrRefId();
        var folderId = currTree.getCurrFolderId();  // folder or root folder
        var ico = "resource://scrapbook/data/" + itemId + "/favicon.ico";
        var comment = document.body.querySelector("#txComment").value;
        if(folderId == "tree1")
            folderId = "urn:scrapbook:root";

        var folderIds = currTree.getExpendedFolderIds().join(",");

        history.getItem('capture.adv.tree.last', rdf);
        history.getItem('capture.adv.tree.focused.last', currTree.getFocusedItem().attr("id"));
        history.getItem('capture.adv.tree.folders.opened', folderIds);

        currTree.createScrapXml(folderId, nodeType, itemId, refId, title, url, ico, comment);
        // currTree.updateComment(currTree.getItemById(itemId), comment);
        browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', backup: true, text: currTree.xmlSerialized(), path: currTree.rdf}).then((response) => {
            browser.runtime.sendMessage({type: 'TAB_INNER_CALL', dest: "CONTENT_PAGE", action: "START_CAPTURE",
                                         title, itemId, rdf, rdfPath, folderId, refId, url, saveType, nodeType, comment}).then(() => {
                                             // can not reach here, because this dialog already removed now
                                         });
        });
    }
    /** tree box */
    var $box = $("#tree1");
    
    var paths = conf.getRdfPaths();
    conf.getRdfPathNames().forEach(function(k, i){
	var $opt = $("<option></option>").attr("value", paths[i]).text(k).appendTo($("#lstRdfs"));
        if(paths[i] == history.getItem("capture.adv.rdf.last"){
            $opt.prop("selected", true);
        }
    });
    $("#lstRdfs").change(function(){
        loadXml($(this).val(), $box);
    });
    
    $("#lstRdfs").change();
});
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == "TAB_INNER_CALL" && request.dest == "CAPTURER_DLG"){
        return new Promise(function(resolve, reject){
            $("#txTitle").val(request.title);
            $("#txUrl").val(request.url);
        });
    }else if(request.type == 'FILE_CONTENT_CHANGED'){
        if(request.filename == currTree.rdf && request.srcToken != currTree.unique_id){
            if(currTree){
                refreshTree(currTree, loadXml, currTree.rdf, $("#tree1"));
            }else{
                $("#lstRdfs").change(); /** reload tree */
            }
        }
    }
});


