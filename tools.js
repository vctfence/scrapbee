import {BookTree} from "./tree.js";;
import {settings} from "./settings.js";
import {SimpleDropdown} from "./control.js";
import {genItemId, refreshTree, httpRequest} from "./utils.js";
import {log} from "./message.js";

function initMover(){
    var mulitCheck;
    $("#multi-select").change(function(){
        mulitCheck = this.checked;
        if(tree0)
            tree0.showCheckBoxes(this.checked);
        if(tree1)
            tree1.showCheckBoxes(this.checked);
    });
    var saveingLocked = false;
    var tree0, tree1;
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if(request.type == 'FILE_CONTENT_CHANGED'){
	    if(request.filename == tree0.rdf && request.srcToken != tree0.unique_id){
                refresh(tree0);
	    }
            if(request.filename == tree1.rdf && request.srcToken != tree1.unique_id){
                refresh(tree1);
            }
        }
    });
    $(".uncheckall-button").each(function(i){
        $(this).click(function(){
            var tree = i == 0 ? tree0 : tree1;
            tree.unCheckAll();
        });
    });
    function refresh(tree){
        var $tree = tree == tree0 ? $("#tree0") : $("#tree1");
        $tree.next(".path-box").find("bdi").text("/");
        refreshTree(tree, loadXml, tree.rdf, $tree, tree == tree0 ? 0 : 1);
    }
    $(".delete-button").each(function(i){
        $(this).click(async function(){
            var tree = i == 0 ? tree0 : tree1;
            var other = i == 0 ? tree1 : tree0;
            var $tree = tree == tree0 ? $("#tree0") : $("#tree1");
            var proceed = false;
            function cfm(){
                proceed = proceed || confirm("{ConfirmDeleteItem}".translate());
                return proceed;
            }
            if($("#multi-select").is(":checked")){
                tree.getCheckedItemsInfo(1).every(function(info){
                    if(info.checkLevel == 0){
                        if(!cfm())return false;
                        tree.removeItem($(info.domElement));
                    }
                    return true;
                });
            }else{
                var $foc = tree.getFocusedItem();
                if($foc.length){
                    if(cfm())tree.removeItem($foc);
                }
            }
            if(proceed){
                await tree.saveXml();
                $tree.next(".path-box").find("bdi").text("/");
            }
        });
    });
    $("#node-mover .tool-button").prop("disabled", true);
    $("#node-mover .tool-button").click(async function(){
        var rightward = $(this).hasClass("rightward");
        var srcTree = rightward ? tree0 : tree1;
        var destTree = rightward ? tree1 : tree0;
        var moveType = $(this).hasClass("copy") ? "FS_COPY" : "FS_MOVE";
        /** src node */
        var $foc = srcTree.getFocusedItem();
        // var [type, introNode] = srcTree.getLiNodeType(liXmlNode)
        /** get rdf item id (none folder)*/
        var $foc_dest = destTree.getFocusedItem();
        var ref_id;
        if($foc_dest.length && !$foc_dest.hasClass("folder")){
            ref_id = $foc_dest.attr("id");
        }
        /** process src nodes */
        saveingLocked = true;
        var parents = [destTree.getCurrContainer()];
        var topNodes = [];
        var topInfos = [];
        var mode_multi = false;
        if($("#multi-select").is(":checked")){
            srcTree.getCheckedItemsInfo(1).forEach(function(item){
                if(item.checkLevel == 0){
                    topNodes.push(item.node);
                    topInfos.push({id:item.id, type:item.type, domElement:item.domElement});
                }
            });
            if(!topNodes.length)
                return alert("{NO_SOURCE_NODE_SELECTED}".translate());    
        }else{
            var id = $foc.attr("id");
            var type = srcTree.getItemType($foc);
            var domElement = $foc[0];
            if(!id)
                return alert("{NO_SOURCE_NODE_SELECTED}".translate());    
            var liXmlNode = srcTree.getItemXmlNode(id);
            topNodes.push(liXmlNode);
            topInfos.push({id, type, domElement});
        }
        /** operation validate */
        if($foc_dest.length && srcTree.rdf == destTree.rdf && moveType == "FS_MOVE"){
            try{
                topInfos.forEach(function(r){ /** check every top level src nodes */
                    if(r.type == "folder"){
                        var dest_type = destTree.getItemType($foc_dest);
                        if(dest_type == "folder"){ /** ref = src folder, means move src folder as its child */
                            if($foc_dest[0].id == r.id){
                                throw Error("{ERROR_MOVE_FOLER_INTO_ITSELF}".translate());
                            }     
                        }else{ /** rdf = descendant of src folder, means move src folder as its descendant */
                            if($foc_dest.closest($(`#${r.id}`).next(".folder-content")).length){
                                throw Error("{ERROR_MOVE_FOLER_INTO_ITSELF}".translate());
                            }
                        }
                    }
                });
            }catch(e){
                return alert(e.message);
            }
        }
        /** show  waiting dialog */
        var waitingDlg = new DialogWaiting();
        waitingDlg.show();
        var pos = settings.saving_new_pos;
        // log.debug("pos" , pos)
        await srcTree.iterateLiNodes(function(item){
            return new Promise((resolve, reject) => {
                var $dest = parents[item.level];
                var id = genItemId();
                var rid = item.level == 0 ? ref_id : null;
                if(item.nodeType == "bookmark" || item.nodeType == "page"){
                    var src = srcTree.rdfPath + 'data/' + item.id;
                    var dest = destTree.rdfPath + 'data/' + id;
                    browser.runtime.sendMessage({type: moveType, src, dest}).catch((e) => {
                        log.error("failed to move/copy files: " + e.message);
                    }).finally((response) => {
                        var icon = item.icon.replace(item.id, id);
                        destTree.createLink($dest, {
                            type: item.type, id, ref_id:rid,
                            source: item.source, icon, title: item.title
                        },{wait: false, is_new: true, pos});
                        pos = "bottom";
                        resolve()
                    });
                }else if(item.nodeType == "seq"){
                    destTree.createFolder($dest, id, rid, item.title, true, pos);
                    parents[item.level+1]=(destTree.getItemById(id).next(".folder-content"));
                    pos = "bottom";
                    resolve();
                }else if(item.nodeType == "separator"){
                    destTree.createSeparator($dest, id, rid, true, pos);
                    pos = "bottom";
                    resolve();
                }
                if(item.level == 0) ref_id = id;
            });
        }, topNodes);
        /** saving changes */
        saveingLocked = false;
        if(tree0.rdf == tree1.rdf){
            if(moveType == "FS_MOVE"){
                topInfos.forEach((info) => {
                    destTree.removeItem(destTree.getItemById(info.id)); /** remove src nodes */
                });
            }
            await destTree.saveXml();
        }else{
            if(moveType == "FS_MOVE"){
                topInfos.forEach((info) => {
                    srcTree.removeItem(srcTree.getItemById(info.id));
                });
            }
            await srcTree.saveXml();
            await destTree.saveXml();
        }
        waitingDlg.remove();
    });
    var selected_rdfs = [];
    $(".drop-box").each(function(i){
        var $label = $(this).find(".label");
        var drop = new SimpleDropdown(this, [], false);
        var paths = settings.getRdfPaths();
        drop.clear();
        drop.onchange=function(title, value){
            selected_rdfs[i] = value;
            var $box = $("#tree" + i);
            $label.html(title || "");
            $box.html("");
            $.post(settings.getBackendAddress() + "isfile/", {path: value, pwd: settings.backend_pwd}, function(r){
                if(r == "yes"){
                    loadXml(value, $box, i);
                    $("#node-mover .tool-button").prop("disabled", !selected_rdfs[1]);
                }
            });            
            $box.next(".path-box").find("bdi").text("/");
            $("#node-mover .tool-button").prop("disabled", true);
        };
        if(paths){
            var names = settings.getRdfPathNames(); 
	    names.forEach(function(n, i){
                drop.addItem(n, paths[i]);
	    });
            drop.select(names[0], paths[0]);
        }
    });
    function loadXml(rdf, $box, treeId){
        return new Promise((resolve, reject) => {
            var xmlhttp=new XMLHttpRequest();
            xmlhttp.onload = async function(r) {
	        var currTree = new BookTree(r.target.response, rdf, {checkboxes: $("#multi-select").is(":checked")});
                if(treeId == 0)
                    tree0 = currTree;
                else if(treeId == 1)
                    tree1 = currTree;
	        await currTree.renderTree($box);
	        currTree.onChooseItem=function(itemId){
                    var t = currTree.getItemPath(currTree.getItemById(itemId));
                    $box.next(".path-box").find("bdi").html(t);
	        };
                currTree.saveXml=currTree.onDragged=function(){
                    return new Promise((resolve, reject) => {
                        if(!saveingLocked){
                            browser.runtime.sendMessage({
                                type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(),
                                path: currTree.rdf, backup: true,
                                boardcast:true, srcToken: currTree.unique_id}).then((response) => {
                                    resolve();
                                });
                        }else{
                            reject();
                        }
                    });
	        };
                resolve(currTree);
            };
            xmlhttp.onerror = function(err) {
                log.info(`load ${rdf} failed, ${err}`);
                reject(err);
            };
            xmlhttp.open("GET", settings.getFileServiceAddress() + rdf, false);
            xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
            xmlhttp.setRequestHeader('cache-control', 'max-age=0');
            xmlhttp.setRequestHeader('expires', '0');
            xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
            xmlhttp.setRequestHeader('pragma', 'no-cache');
            xmlhttp.send();
        });
    }
}
function exportTree(rdf, name, includeSeparator, openInNewTab){
    return new Promise((resolve, reject)=>{
        httpRequest(settings.getFileServiceAddress() + rdf).then(async (response)=>{
            var blob = await fetch("icons/item.gif").then(r => r.blob());
            var path = rdf.replace(/\w+\.rdf\s*$/i, "data/resources/item.gif");
            browser.runtime.sendMessage({type: 'SAVE_BLOB_ITEM', item: {path, blob}});

            var blob = await fetch("icons/folder.gif").then(r => r.blob());
            var path = rdf.replace(/\w+\.rdf\s*$/i, "data/resources/folder.gif");
            browser.runtime.sendMessage({type: 'SAVE_BLOB_ITEM', item: {path, blob}});

            var blob = await fetch("icons/openfolder.gif").then(r => r.blob());
            var path = rdf.replace(/\w+\.rdf\s*$/i, "data/resources/openfolder.gif");
            browser.runtime.sendMessage({type: 'SAVE_BLOB_ITEM', item: {path, blob}});

            var tree = new BookTree(response, rdf);
            var buffer = [`<title>${name}</title>`, "<meta charset='UTF-8'/>"];
            await tree.iterateLiNodes(async function(item){
                if(item.nodeType == "seq"){
                    buffer.push("<li class='seq'><img src='data/resources/folder.gif'/>" + item.title + "</li>");
                    buffer.push("<ul>");
                }else if(item.nodeType == "separator"){
                    if(includeSeparator)
                        buffer.push(`<hr/>`);
                }else{
                    var type = item.nodeType;
                    var icon = tree.translateResourceAsRelative(item.icon);
                    if(icon == "") icon = "data/resources/item.gif";
                    var nt = openInNewTab ? " target='_blank'" : "";
                    if(type == "bookmark"){
                        buffer.push(`<li class='bookmark'><img src='${icon}'/><a href='${item.source}'${nt}>${item.title}</a></li>`);    
                    }else if(type == "page"){
                        buffer.push(`<li class='page' ><img src='${icon}'/><a href='data/${item.id}/index.html'${nt}>${item.title}</a></li>`);
                    }
                }
            }, null, function(item){
                buffer.push("</ul>");
            });
            buffer.push(`
 <style>
 .bookmark a{color:#050}
 .page a{color:#000}
 ul{
   display:none;
   margin-top:0;
   margin-bottom:0;
   margin-left:1.5em;
   padding:0;
 }
 li{cursor:default;list-style: none;}
 li img{
   width:1em;
   height:1em;
   vertical-align:middle;
   margin-right:5px;
 }
</style>
`);
buffer.push(`
<script>
  NodeList.prototype.forEach = Array.prototype.forEach;
  var nodes = document.querySelectorAll("li");
  nodes.forEach(function(item){
    if(item.className == "seq"){
      item.onclick=function(){
        if(this.getAttribute("opened") !== "1"){
          this.setAttribute("opened", "1")
          this.querySelector("img").src = "data/resources/openfolder.gif"
        }else{
          this.setAttribute("opened", "0")
          this.querySelector("img").src = "data/resources/folder.gif"
        }
        var ul = this.nextElementSibling;
        if(ul && ul.tagName == "UL"){
          ul.style.display= ul.style.display == "block" ? "none" : "block";
        }
      }
    }
  });
</script>`);
            var path = rdf.replace(/\.rdf\s*$/i, ".html");
            browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: buffer.join("\n"), path: path}).then((response) => {
                resolve()
            });
        });
    });
}
function initExporter(){
    var paths = settings.getRdfPaths();
    var $drop = $("#exporter #select-rdf");
    var paths = settings.getRdfPaths();
    if(paths){
        var names = settings.getRdfPathNames();
	names.forEach(function(n, i){
            var $opt = $("<option>").appendTo($drop);
            $opt.html(names[i]);
            $opt.prop("value", paths[i]);
	});
    }
    $drop.change(function(e){
        var path = $(this).find("option:selected").attr("value").replace(/\.rdf\s*$/i, ".html");
        $(this).parent().next("div").find("span.path").html(path).click(() => {
            window.open(settings.getFileServiceAddress() + path, "_blank");
        });
        
    });
    $drop.change();
    $("#btnExport").click(function(){
        var self = this;
        var rdf = $drop.find("option:selected").attr("value");
        var name = $drop.find("option:selected").html();
        var includeSeparator = $("#exporter #include-separator").is(":checked");
        var openInNewTab = $("#exporter #open-in-new-tab").is(":checked");
        var waitingDlg = new DialogWaiting();
        waitingDlg.show();
        exportTree(rdf, name, includeSeparator, openInNewTab).then(()=>{
            setTimeout(()=>{
                waitingDlg.remove();
            }, 2000)
        });
    });
}
export {initMover, initExporter};
