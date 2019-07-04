import {BookTree} from "./tree.js";
import {settings} from "./settings.js"
import {SimpleDropdown} from "./control.js"
import {genItemId} from "./utils.js"

function initMover(){
    $("#multi-select").change(function(){
        if(tree1)
            tree1.showCheckBoxes(this.checked)
        if(tree2)
            tree2.showCheckBoxes(this.checked)
    });
    var saveingLocked = false;
    var tree1, tree2;
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if(request.type == 'RDF_EDITED'){
	    if(request.rdf == tree1.rdf){
                var $box = $("#tree1");
                if($box.is(":visible"))alert("{SAME_RDF_MODIFIED}".translate());
                loadXml(tree1.rdf, $box, 1)
	    }else if(request.rdf == tree2.rdf){
                var $box = $("#tree2");
                if($box.is(":visible"))alert("{SAME_RDF_MODIFIED}".translate());
                loadXml(tree2.rdf, $box, 2)
            }
        }
    });
    $(".uncheckall-button").each(function(i){
        $(this).click(function(){
            var tree = i == 0 ? tree1 : tree2;
            tree.unCheckAll();
        });
    });
    $(".delete-button").each(function(i){
        $(this).click(function(){
            var tree = i == 0 ? tree1 : tree2;
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
                tree.onXmlChanged();
            }
        });
    });
    $("#node-mover .tool-button").prop("disabled", true);
    $("#node-mover .tool-button").click(async function(){
        var rightward = $(this).hasClass("rightward");
        var srcTree = rightward ? tree1 : tree2;
        var destTree = rightward ? tree2 : tree1;
        var moveType = $(this).hasClass("copy") ? "FS_COPY" : "FS_MOVE";
        /** src node */
        var $foc = srcTree.getFocusedItem();
        var id = $foc.attr("id");
        // var [type, introNode] = srcTree.getLiNodeType(liXmlNode)
        /** get rdf item id (none folder)*/
        var $f = destTree.getFocusedItem(), ref_id;
        if($f.length && !$f.hasClass("folder")){
            ref_id = $f.attr("id");
        }
        /** process src nodes */
        saveingLocked = true;
        var parents = [destTree.getCurrContainer()];
        var topNodes = [];
        var mode_multi = false;
        if($("#multi-select").is(":checked")){
            srcTree.getCheckedItemsInfo(1).forEach(function(item){
                if(item.checkLevel == 0)
                    topNodes.push(item.node);
            });
            if(!topNodes.length)
                return alert("{NO_SOURCE_NODE_SELECTED}".translate());    
        }else{
            if(!id)
                return alert("{NO_SOURCE_NODE_SELECTED}".translate());    
            var liXmlNode = srcTree.getItemXmlNode(id);
            topNodes.push(liXmlNode);
        }
        /** show  waiting dialog */
        var waitingDlg = new DialogWaiting();
        waitingDlg.show();
        await srcTree.iterateLiNodes(function(nodeJson){
            return new Promise((resolve, reject) => {
                var $dest = parents[nodeJson.level];
                var id = genItemId();
                var rid = nodeJson.level == 0 ? ref_id : null;
                if(nodeJson.nodeType == "scrap"){
                    var src = srcTree.rdf_path + 'data/' + nodeJson.id;
                    var dest = destTree.rdf_path + 'data/' + id;
                    browser.runtime.sendMessage({type: moveType, src, dest}).then((response) => {
                        var icon = nodeJson.icon.replace(nodeJson.id, id)
                        destTree.createLink($dest, nodeJson.type, id, rid, nodeJson.source, icon, nodeJson.title, false, true);
                        resolve()
                    }).catch((e) => {
                        saveingLocked = false;
                    });
                }else if(nodeJson.nodeType == "seq"){
                    destTree.createFolder($dest, id, rid, nodeJson.title, true);
                    parents[nodeJson.level+1]=(destTree.getItemById(id).next(".folder-content"))
                    resolve()
                }else if(nodeJson.nodeType == "separator"){
                    destTree.createSeparator($dest, id, rid, true);
                    resolve();
                }
                if(nodeJson.level == 0) ref_id = id;
            });
        }, topNodes);
        /** saving changes */
        saveingLocked = false;
        destTree.onXmlChanged();
        if(moveType == "FS_MOVE"){
            srcTree.removeItem($foc); /*** will trigger saving */
        }
        waitingDlg.hide();
    });
    var selected_rdfs = [];
    $(".drop-box").each(function(i){
        var $label = $(this).find(".label") 
        var drop = new SimpleDropdown(this, [], false);
        var paths = settings.getRdfPaths();

        drop.clear()
        drop.onchange=function(title, value){
            selected_rdfs[i] = value;
            var $box = $("#tree" + (i + 1));
            $label.html(title || "");
            $box.html("");
            $.post(settings.backend_url + "isfile/", {path: value}, function(r){
                if(r == "yes"){
                    loadXml(value, $box, i+1);
                    $("#node-mover .tool-button").prop("disabled", selected_rdfs[1] && selected_rdfs[0] == selected_rdfs[1]);
                }
            })
            $box.next(".path-box").html("/");
            $("#node-mover .tool-button").prop("disabled", true);
        };
        if(paths){
            var names = settings.getRdfPathNames(); 
	    names.forEach(function(n, i){
                drop.addItem(n, paths[i]);
	    });
            drop.select(names[i], paths[i]);
        }
    });
    function loadXml(rdf, $box, treeId){
        var xmlhttp=new XMLHttpRequest();
        xmlhttp.onload = async function(r) {
	    var currTree = new BookTree(r.target.response, rdf, {checkboxes: $("#multi-select").is(":checked")})
            if(treeId == 1)
                tree1 = currTree
            else if(treeId == 2)
                tree2 = currTree
	    await currTree.renderTree($box);
	    currTree.onChooseItem=function(itemId){
                var t = currTree.getItemPath(currTree.getItemById(itemId))
                $box.next(".path-box").html(`<bdi>${t}</bdi>`)
	    }
            currTree.onXmlChanged=function(){
                if(!saveingLocked){
                    browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(), path: currTree.rdf}).then((response) => {
                        browser.runtime.sendMessage({type: 'RDF_EDITED', rdf: currTree.rdf}).then((response) => {});
                    });
                }
	    }
        };
        xmlhttp.onerror = function(err) {
	    log.info(`load ${rdf} failed, ${err}`)
        };
        xmlhttp.open("GET", settings.backend_url + "file-service/" + rdf, false);
        xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
        xmlhttp.setRequestHeader('cache-control', 'max-age=0');
        xmlhttp.setRequestHeader('expires', '0');
        xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
        xmlhttp.setRequestHeader('pragma', 'no-cache');
        xmlhttp.send();
    }
}
export {initMover}
