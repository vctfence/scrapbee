var CONTEXT;
var currTree;
var DLG;

function randRange(a, b){
    return Math.floor(Math.random() * (b-a+1)) + a;
}

function genItemId(proto){
    var r = String(randRange(1,999999)).padStart(6, "0");
    if(proto)
        return proto.substr(0, 14) + r;
    else
        return new Date().format("yyyyMMddhhmmss" + r);
}

function refreshTree(){
    var params = Array.from(arguments);
    var tree = params.shift();
    var fnLoad = params.shift();
    var $box = params[1];
    return new Promise((resolve, reject) => {
        var expendedIds = tree.getExpendedFolderIds();
        var focusId = tree.getFocusedItem().attr('id');
        var p = fnLoad.apply(null, params);
        p.then((tree) => {
            expendedIds.forEach((id) => {
                tree.toggleFolder(tree.getItemById(id), true);
            });
            var $item = tree.getItemById(focusId);
            tree.focusItem($item);
            tree.scrollToItem($box.parent(), $item, false);
            tree.onChooseItem();
            resolve();
        });
    });
}

var JsonExt = class {
    constructor(data){
        this.data = data;
    }
    getItem(key){
        var t = this.data;
        key.split(".").every(k => {
            if(t)
                t = t[k];
            return !(t == null || t == undefined);
        });
        return t;
    }
};

function loadXml(rdf, $box, loadHistory=true){
    return new Promise(async (resolve, reject) => {
        DLG.findChildren("input[type=button]").forEach(el => el.setAttribute("disabled", true));
        $box.empty().text("loading...");
        var xmlhttp = new XMLHttpRequest();
        xmlhttp.onload = async function(r) {
	    currTree = new BookTree(r.target.response, rdf, {lockDraging: true});
	    await currTree.renderTree($box, true);
            // currTree.toggleFolder(currTree.getItemById("root"), true);
            currTree.onChooseItem = function(itemId) {
                var t = currTree.getItemPath(currTree.getItemById(itemId));
                $(DLG.findChild("#path-box bdi")).html(t);
	    };
            DLG.findChildren("input[type=button]").forEach(el => el.removeAttribute("disabled"));
            /** restore status */
            if(loadHistory && HISTORY.getItem("capture.adv.tree.last") == rdf){
                var folders = HISTORY.getItem("capture.adv.tree.folders.opened");
                var focused = HISTORY.getItem("capture.adv.tree.focused.last");
                if(folders){
                    folders.split(",").forEach(function(id){
                        currTree.toggleFolder(currTree.getItemById(id), true);
                    });
                }
                if(focused){
                    var $item = currTree.getItemById(focused);
                    currTree.focusItem($item);
                    currTree.scrollToItem($box.parent(), $item, false);
                    currTree.onChooseItem(focused);
                }
            }
            resolve(currTree);
        };
        xmlhttp.onerror = function(err) {
	    log.info(`load ${rdf} failed, ${err}`);
        };
        /** fetch rdf */
        var addr = CONF.getItem('__computed.fileServiceAddress');
        xmlhttp.open("GET", `${addr}/${rdf}`, false);
        xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
        xmlhttp.setRequestHeader('cache-control', 'max-age=0');
        xmlhttp.setRequestHeader('expires', '0');
        xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
        xmlhttp.setRequestHeader('pragma', 'no-cache');
        xmlhttp.send();
    });
}

async function advDialog(context){
    CONTEXT = context;
    
    /* store host page selection */
    const selection = window.getSelection();
    const ranges = [];
    for(var i=0; i<selection.rangeCount; i++){
        ranges.push(selection.getRangeAt(i));
    }

    function restore() {
        let s = window.getSelection();
        s.removeAllRanges();
        ranges.forEach(r => s.addRange(r));

        dlg.remove();
        context.unlock();
    }

    var conf = await browser.runtime.sendMessage({type:'GET_SETTINGS'});
    window.CONF = new JsonExt(conf);

    var history = await browser.runtime.sendMessage({type:'GET_HISTORY'});
    window.HISTORY = new JsonExt(history);
    
    var html = await loadAssetText(("/html/advcap.html"));
    var css = await loadAssetText(("/css/dialog.css"));
    css += await loadAssetText(("/css/tree.css"));

    var dlg = new Dialog('Download');
    dlg.styleSheet = css.replace(/@import.*?[\n\r]/, '');
    dlg.content = html.replace(/<body>[\s\S.]*/, s => s.translate());
    dlg.show();
    
    DLG = dlg;

    DLG.findChild("#txTitle").value = document.title;
    DLG.findChild("#txUrl").value = location.href;

    // DLG.findChild("style").textContent = css;
    // var c = document.documentElement.querySelector("scrapbee-dialog")

    /** add script tag */
    // const script = document.createElement('script');
    // script.textContent = `alert(loadAssetText);`;
    // dlg.appendChild(script);

    /** disable buttons */
    DLG.findChildren("input[type=button]").forEach(el => el.setAttribute("disabled", true));

    /** init trees box */
    var $box = $(DLG.findChild("#tree1"));
    $box.empty().text("loading...");
    
    /** load trees */
    var $drop = $(DLG.findChild("#lstRdfs"));
    CONF.getItem('tree.names').forEach(function(k, i){
        var $opt = $("<option></option>").attr("value", CONF.getItem('tree.paths')[i]).text(k).appendTo($drop);
        if(CONF.getItem('tree.paths')[i] == HISTORY.getItem('capture.adv.tree.last')){
            $opt.prop("selected", true);
        }
    });
    $drop.change(function(){
        loadXml($(this).val(), $box);
    });
    $drop.change();

    /** add folder */
    var button = DLG.findChild("#btnAddFoder");
    button.onclick = function(){
        var title = prompt("Please input name of new folder");
        if(!title) return;

        var pos = CONF.getItem('capture.behavior.item.new.pos');
        currTree.createFolder(currTree.getCurrContainer(), genItemId(), currTree.getCurrRefId(), title, true, pos);
        browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(),
                                     path: currTree.rdf, backup:true, boardcast:true, srcToken: currTree.unique_id}).then((response) => {});
    };
    
    /** cancle capture */
    var button = $(DLG.findChild("#btnCancel"));
    button.click(function(){
        restore();
    });

    /** start capture */
    var button = $(DLG.findChild("#btnCapture"));
    button.click(function(){
        var saveType = DLG.findChild("input[type=radio][name=save_type]:checked").value;
        var nodeType = saveType == "SAVE_URL" ? "bookmark" : "page";
        var itemId = genItemId();
        var title = DLG.findChild("#txTitle").value;
        var url = DLG.findChild("#txUrl").value;
        var rdfHome = currTree.rdfHome;
        var rdf = currTree.rdf;
        var refId = currTree.getCurrRefId();
        var ico = "resource://scrapbook/data/" + itemId + "/favicon.ico";
        var comment = DLG.findChild("#txComment").value;
        var folderIds = currTree.getExpendedFolderIds().join(",");
        browser.runtime.sendMessage({type: 'SAVE_HISTORY', items: {
            "capture.adv.tree.last": rdf,
            "capture.adv.tree.focused.last": currTree.getFocusedItem().attr("id"),
            "capture.adv.tree.folders.opened": folderIds,
        }}).then(_ => {
            var folderId = currTree.getCurrFolderId();  // folder or root folder
            if(folderId == "tree1")
                folderId = "urn:scrapbook:root";
            currTree.createScrapXml(folderId, nodeType, itemId, refId, title, url, ico, comment);
            browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', backup: true, text: currTree.xmlSerialized(), path: currTree.rdf, boardcast:true}).then(r => {
                restore();

                if(saveType == "SAVE_URL")
                    context.saveBookmarkIcon(rdf, rdfHome, itemId);
                else
                    context.startCapture(saveType, rdf, rdfHome, itemId);
            });
        });
    });
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if(request.type == 'FILE_CONTENT_CHANGED') {
            if(request.filename == currTree.rdf && request.srcToken != currTree.unique_id){
                if(currTree){
                    refreshTree(currTree, loadXml, currTree.rdf, $(DLG.findChild("#tree1")), false);
                }else{
                    $("#lstRdfs").change(); /** reload tree */
                }
            }
        }
    });
}

