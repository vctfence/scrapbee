import {settings} from "./settings.js"
import {BookTree} from "./tree.js"
import {log} from "./message.js"

var currTree;
function loadXml(rdf, $box, treeId){
    $("#path-box").html(`<bdi>/</bdi>`);
    $("input[type=button]").prop("disabled", true);
    $box.html("loading...");
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onload = async function(r) {
	currTree = new BookTree(r.target.response, rdf);
	await currTree.renderTree($box);
        currTree.onChooseItem = function(itemId) {
            var t = currTree.getItemPath(currTree.getItemById(itemId));
            $("#path-box").html(`<bdi>${t}</bdi>`);
	}
        $("input[type=button]").prop("disabled", false);
    };
    xmlhttp.onerror = function(err) {
	log.info(`load ${rdf} failed, ${err}`);
    };
    xmlhttp.open("GET", "http://localhost:9900/file-service/" + rdf, false);
    xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
    xmlhttp.setRequestHeader('cache-control', 'max-age=0');
    xmlhttp.setRequestHeader('expires', '0');
    xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
    xmlhttp.setRequestHeader('pragma', 'no-cache');
    xmlhttp.send();
}
$(document).ready(async function(){
    document.body.innerHTML = document.body.innerHTML.translate();
    
    function randRange(a, b){
        return Math.floor(Math.random() * (b-a+1)) + a;
    }
    function genItemId(){
        return new Date().format("yyyyMMddhhmmssS" + String(randRange(1,999999)).padStart(6, "0"));
    }
    $("input[type=button]").prop("disabled", true);
    /** add folder */
    var button = document.body.querySelector("#btnAddFoder");
    button.onclick=function(){
        var title = prompt("Please input name of new folder");
        if(!title) return;
        currTree.createFolder(currTree.getCurrContainer(), genItemId(), currTree.getCurrRefId(), title, true);
        browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(),
                                     path: currTree.rdf, boardcast:true, srcToken: currTree.unique_id}).then((response) => {});
    }
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
        if(folderId == "tree1")
            folderId = "urn:scrapbook:root";
        currTree.createScrapXml(folderId, nodeType, itemId, refId, title, url, ico);
        browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(), path: currTree.rdf}).then((response) => {
            browser.runtime.sendMessage({type: 'TAB_INNER_CALL', dest: "CONTENT_PAGE", action: "START_CAPTURE",
                                         title, itemId, rdf, rdfPath, folderId, refId, url, saveType, nodeType}).then(() => {
                                             // can not reach here, because this dialog already removed now
                                         });
        });
    }
    /** tree box */
    var $box = $("#tree1");
    await settings.loadFromStorage();
    var paths = settings.getRdfPaths();
    settings.getRdfPathNames().forEach(function(k, i){
	$("<option></option>").attr("value", paths[i]).html(k).appendTo($("#lstRdfs"));
    });
    $("#lstRdfs").change(function(){
        loadXml($(this).val(), $box, 1)
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
            $("#lstRdfs").change(); /** reload tree */
        }
    }
});
