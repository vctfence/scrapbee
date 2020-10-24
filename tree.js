import {settings} from "./settings.js";
import {log} from "./message.js";
import {randRange, comp} from "./utils.js";

class NodeHTMLBuffer {
    constructor(start, end) {
        this.start=start;
        this.end=end;
        this.children=[];
    }
    appendChild(c) {
        this.children.push(c);
    }
    flattenArray() {
        var list = [this.start];
        this.children.forEach(function(c){
            list = list.concat(c.flattenArray());
        });
        list.push(this.end);
        return list;        
    }
    flatten() {
        var list = [this.start];
        this.children.forEach(function(c){
            list.push(c.flatten());
        });
        list.push(this.end);
        return list.join("");
    }
}
class BookTree {
    constructor(xmlString, rdf_full_file, options={}) {
        var self = this;
        this.unique_id = randRange(0, 99999999); 
        this.options = options;
        this.rdf = rdf_full_file;
        this.rdfPath = rdf_full_file.replace(/[^\/\\]*$/, "");
        this.xmlDoc = new DOMParser().parseFromString(xmlString, 'text/xml');
        this.namespaces = this.getNameSpaces();
        Object.keys(this.namespaces).forEach(function(k) {
            var v = self.namespaces[k];
            if (/^NS\d+$/.test(k))
                self.MAIN_NS = v;
            self["NS_" + k] = v;
        });
        this.nsResolver=function(prefix) {
            return self.namespaces[prefix] || null;
        };
        this.cacheXmlNode();
    }
    getItemType($item){
        var type = "page";
        if($item.hasClass("folder")){
            type = "folder";
        }else if($item.hasClass("separator")){
            type = "separator";
        }else if($item.hasClass("bookmark")){
            type = "bookmark";
        }
        return type;
    }
    unCheckAll(){
        this.$top_container.find(".item input[type='checkbox']").prop('checked', false);
    }
    showCheckBoxes(visible){
        this.options.checkboxes = visible;
        if(visible)
            this.$top_container.find(".item input[type='checkbox']").css('display', 'inline-block');
        else
            this.$top_container.find(".item input[type='checkbox']").css('display', 'none');
    }
    translateResourceAsRelative(r) {
        if(/^resource\:/.test(r)){ /** scrap data */
            r = r.replace(/^resource\:\/\/scrapbook\//, "");
        }else if((/^(\/|(\[a-z]\:))/).test(r)){ /** local file */
            r =  "file://" + r;
        }
        r = r.replace(/\\/g, "/").replace(/([^\:\/])\/{2,}/g, function(a, b, c){
            return b + "/";
        });
        return r;
    }
    translateResource(r, rdfPath, id) {
        /** scrap data */
        r = r.replace(
            /^resource\:\/\/scrapbook/,
            settings.getFileServiceAddress() + rdfPath
        );
        /** local file */
        if((/^(\/|(\[a-z]\:))/).test(r)){
            r =  settings.getFileServiceAddress() + r;
        }
        r = r.replace(/\\/g, "/").replace(/([^\:\/])\/{2,}/g, function(a, b, c){
            return b + "/";
        });
        return r;
    }
    listenUserEvents($container) {
        var self = this;
        var dragging = false;
        var $drag_item;
        var $ref_item;
        var t;
        function getItemNode(el) {
            var $h = $(el);
            var $p = $h.parent();
            var $el;
            if ($h.hasClass("item")) {
                $el = $h;
            } else if ($p.hasClass("item")) {
                $el = $p;
            }
            return $el;
        }
        var token = $container.prop("scrapbee_tree_token") || randRange(0, 99999999);
        $(document).unbind('.BookTree' + token);
        $container.prop("scrapbee_tree_token", token);
        // mouse down (focus items)
        $(document).bind("mousedown.BookTree" + token, function (e) {
            if(e.target.tagName != "INPUT"){
                if(!$(e.target).closest($container).length)
                    return;
                var $el = getItemNode(e.target);
                if ($el) {
                    if ($el.hasClass("separator") || $el.hasClass("folder") || $el.hasClass("page") || $el.hasClass("bookmark")) {
                        if(self.onChooseItem)self.onChooseItem($el.attr("id"));
                        // var ref_node = self.getLiNode("urn:scrapbook:item" + $el.attr("id"));
                        // console.log($el.attr("id"))
                        // console.log(ref_node.nextElementSibling)
                    }            
                    if (e.button == 0) {
                        e.preventDefault();
                        $drag_item = $el;
                        $ref_item = $el;
                        dragging = !self.options.lockDraging;
                        t = 0;
                    }
                    self.focusItem($el);                    
                }
            }
        });
        // hack middle clicking
        $(document).on("mousedown", function (e1) {
            $(document).one("mouseup", function (e2) {
                if (e1.which == 2 && e1.target == e2.target) {
                    var e3 = $.event.fix(e2);
                    e3.type = "click";
                    $(e2.target).trigger(e3)
                }
            });
        });
        // click nodes
        $(document).bind("click.BookTree" + token, function (e) {
            if(!$(e.target).closest($container).length)
                return;
            var $el = getItemNode(e.target);
            if (!$el || !$el.length)
                return;
            if ($el.hasClass("folder")) {
                if(e.target.tagName != "INPUT") {
                    self.toggleFolder($el);
                    if(self.onToggleFolder)self.onToggleFolder($el);
                }
            } else if ($el.hasClass("page") || $el.hasClass("bookmark")) {
                if(e.target.tagName != "INPUT"){
                    if ($el.attr("disabled"))
                        return;
                    var url = $el.attr("source");
                    var is_local = ($el.hasClass("page") && !$(e.target).hasClass("origin"));
                    if (is_local) {
                        url = self.getItemIndexPage($el.attr("id"));
                    }
                    if ((settings.open_in_current_tab == "on") === !(e.ctrlKey || e.metaKey || e.which == 2)) {
                        if(self.onOpenContent)self.onOpenContent($el.attr("id"), url, false, is_local);
                    } else {
                        if(self.onOpenContent)self.onOpenContent($el.attr("id"), url, true, is_local);
                    }
                }
            }
        });
        // mouse up
        $(document).bind("mouseup.BookTree" + token, function (e) {
            /** toggle checkboxs recursively */
            if(e.target.tagName == "INPUT" && e.button == 0){
                $(e.target).parent().next(".folder-content").find("input").prop("checked", !e.target.checked);
                if(e.target.checked){
                    $(e.target).parents(".folder-content").prev("div").find("input").prop("checked", false);
                }
            }
            /** end of item dragging */
            if (!dragging) return;
            dragging = false;
            $container.find(".drag-mark").remove();
            if ($ref_item && [1, 2, 3].includes(t)) {
                if ($drag_item[0] != $ref_item[0]) {
                    self.moveNode($drag_item, $ref_item, t);
                    if(self.onDragged)self.onDragged($drag_item);
                }
            }
            $ref_item = null;
            $container.find(".drag-into").removeClass("drag-into");
        });
        // mouse move
        var $prev_ref, prev_t;
        $(document).bind("mousemove.BookTree" + token, function (e) {
            if (!dragging) return;
            var $el = self.getItemY($container, e.pageY) || $ref_item;
            $ref_item = $el;
            var drag_mark = $("<hr class='drag-mark'/>");
            if ($el) {
                $container.find(".drag-into").removeClass("drag-into");
                var parentOffset = $el.offset();
                var relX = e.pageX - parentOffset.left;
                var relY = e.pageY - parentOffset.top;
                /** get drag ref and position */
                $ref_item = $el;
                if ($el.hasClass("folder")) {
                    var $children = $el.nextAll(".folder-content:first").children(".item");
                    var expanded_owner = $el.hasClass("expended") && ($children.length > 0);
                    var $parent = self.getParentFolderItem($drag_item);
                    var single_child = ($children.length == 1 && $parent && $parent[0] == $el[0]);
                    if ((!expanded_owner || single_child) && relY > $el.height() * 0.6) { // after
                        t = 2;
                    } else if (relY < $el.height() * 0.3) { // before
                        t = 1;
                    } else {
                        // self.toggleFolder($el, true);
                        t = 3; // into
                    }
                } else {
                    t = (relY > $el.height() * 0.5) ? 2 : 1;
                }
                /** show dragging mark */
                if((!$prev_ref || ($prev_ref[0] != $el[0])) || prev_t != t){
                    $container.find(".drag-mark").remove();
                    if (t == 1) {
                        $el.before(drag_mark);
                    } else if (t == 2) {
                        $el.after(drag_mark);
                    } else if (t == 3) {
                        $el.after(drag_mark);
                        drag_mark.css("width", "30px");
                    }
                }
                /** ignore invalid folder dragging */
                if ($drag_item.hasClass("folder")) {
                    if ($drag_item[0] == $el[0]) {
                        t = 0;
                    } else if ($.contains($drag_item.nextAll(".folder-content:first")[0], $el[0])) {
                        t = 0;
                    }
                }
            }
            $prev_ref = $el;
            prev_t = t;
        });
    }
    getItemIcon(id) {
        var node = this.getDescNode("urn:scrapbook:item" + id);
        var c = node.getAttributeNS(this.MAIN_NS, "icon") || "";
        return c;
    }
    getItemComment(id) {
        var node = this.getDescNode("urn:scrapbook:item" + id);
        var c = node.getAttributeNS(this.MAIN_NS, "comment") || "";
        c = c.replace(/ __BR__ /g, "\n");
        c = c.htmlDecode(); // temporary solution for html entity
        node.setAttributeNS(this.MAIN_NS, "comment", c); // temporarily replace html entity
        return c;
    }
    getItemTag(id) {
        var node = this.getDescNode("urn:scrapbook:item" + id);
        var c = node.getAttributeNS(this.MAIN_NS, "tag") || "";
        c = c.htmlDecode();
        return c;
    }
    getItemTag(id) {
        var node = this.getDescNode("urn:scrapbook:item" + id);
        var c = node.getAttributeNS(this.MAIN_NS, "tag") || "";
        c = c.htmlDecode();
        return c;
    }
    getItemFilePath(id) {
        return (this.rdfPath + "data/" + id + "/").replace(/\/{2,}/g, "/");
    }    
    getItemIndexPage(id) {
        return (settings.getFileServiceAddress() + this.rdfPath + "data/" + id + "/").replace(/\/{2,}/g, "/") + `?scrapbee_refresh=` + new Date().getTime();
    }
    toggleFolder($item, on) {
        if ($item && $item.hasClass("folder")) {
            if (!$item.hasClass("expended") || on) {
                $item.addClass("expended");
                $item.nextAll(".folder-content:first").show();
            } else {
                $item.removeClass("expended");
                $item.nextAll(".folder-content:first").hide();
            }
        }
    }
    scrollToItem($item, ms, mostTop, ani=true){
        if($item && $item.length){
            if(ani){
                $(document.body).animate({
                    scrollTop: $item.offset().top - mostTop
                }, ms);
            }else{
                document.body.scrollTop = $item.offset().top - mostTop;
            }
        }
     }
    getExpendedFolderIds(){
        var ids = [];
        this.$top_container.find(".item.folder.expended").each(function(){
            ids.push(this.id);
        });
        return ids;
    }
    expandAllParents($item){
        var self = this;
        $item.parents(".folder-content").each(function(){
            self.toggleFolder($(this).prev(".item"), true);
        });
    }
    getItemY($container, y) {
        y -= window.scrollY;
        var r = null;
        $container.find(".item:visible").each(function () {
            var rect = this.getBoundingClientRect();
            if (rect.top < y && rect.bottom > y) {
                r = $(this);
                return;
            }
        });
        return r;
    }
    moveNode($item, $ref_item, move_type) {
        if (![1, 2, 3].includes(move_type))
            return;
        var $c = $item.clone();
        if (move_type == 3){
            $ref_item.nextAll(".folder-content:first").append($c);
        }else if (move_type == 2){
            if ($ref_item.hasClass("folder"))
                $ref_item.nextAll(".folder-content:first").after($c);
            else
                $ref_item.after($c);
        }else if (move_type == 1){
            $ref_item.before($c);
        }
        if ($item.hasClass("folder")) {
            var $cc = $item.nextAll(".folder-content:first").clone();
            $c.after($cc);
            $item.nextAll(".folder-content:first").remove();
        }
        this.moveItemXml($c.attr("id"), $c.parent().prev(".folder").attr("id"), $ref_item.attr("id"), move_type);
        $item.remove();
    }
    getCheckedItemsInfo(sort=-1){
        var self = this, buf = [];
        this.$top_container.find(".item input[type=checkbox]:checked").toArray().forEach(function(check){
            var $item = $(check).parent();
            var id = $item.prop("id");
            buf.push({
                id,
                type:self.getItemType($item),
                title:$item.prop("title"),
                node: self.getLiNode("urn:scrapbook:item" + id),
                checkLevel: $item.parents(".folder-content").prev("div").find("input[type=checkbox]:checked").length,
                domElement: $item[0]
            });
        });
        buf = buf.sort(function(a, b){
            return sort * comp(a.checkLevel, b.checkLevel);
        });
        return buf;
    }

    getDescendantItems($root){
        var self = this, buf = [];
        if(this.getItemType($root) == "folder"){
            $root.nextAll(".folder-content:first").find(".item").toArray().forEach(function(item){
                var $item = $(item);
                var id = $item.prop("id");
                buf.push({
                    id,
                    type:self.getItemType($item),
                    title:$item.prop("title"),
                    node: self.getLiNode("urn:scrapbook:item" + id),
                    checkLevel: $item.parents(".folder-content").prev("div").find("input[type=checkbox]:checked").length,
                    domElement: $item[0]
                });
            });
        }
        return buf;
    }
    
    async sortTree(sortBy="title", $targetNode=null, asc=true) {
        var self = this;
        var items = [];
        var sects = {};
        var nodes = null;
        if($targetNode){
            var id = $targetNode.attr("id");
            var node = this.getLiNode("urn:scrapbook:item" + id);
            var [nodeType, introNode] = this.getLiNodeType(node);
            if (nodeType == "seq") { // folder
                var seqNode = introNode;
                nodes = seqNode.children;    
            }else{
                nodes = [];
            }
        }else{
            nodes = this.getSeqNode("urn:scrapbook:root").children; 
        }
        await this.iterateLiNodes(function (json, node) {
            var inc = json.nodeType == "separator" ? 1 : 0;
            var title = (json.title || "").toLowerCase();
            var parentId = json.parentId || "urn:scrapbook:root";
            sects[parentId] = sects[parentId] || 0;
            sects[parentId] += inc;
            items.push({id: json.id, title, parentId, sect: sects[parentId], node, type: json.nodeType});
            sects[parentId] += inc;
        }, nodes);
        items = items.sort(function(a, b){
            var v = comp(a.parentId, b.parentId);
            v = v || comp(a.sect, b.sect);
            v = v || (a.type == b.type ? 0 : (a.type == "seq" ? -1 : 1));
            if(v == 0){
                if(sortBy == "title"){
                    /*** hack: put Far East Character behind */
                    if(a.title.length && b.title.length){
                        var x = a.title[0], y = b.title[0];
                        x = x.match(/[\u4E00-\u9FA5\uF900-\uFA2D]/) ? 1 : 0;
                        y = y.match(/[\u4E00-\u9FA5\uF900-\uFA2D]/) ? 1 : 0;
                        v = comp(x, y);
                    }
                    v = v || a.title.localeCompare(b.title, browser.i18n.getUILanguage(), {sensitivity: 'base', ignorePunctuation: 'true'});
                }else if(sortBy == "date"){
                    v = v || a.id > b.id;
                }
                /** apply sort order */
                v *= (asc ? 1 : -1);
            }
            return v;
        });
        items.forEach(function(a){
            var nn = a.node.cloneNode();
            a.node.parentNode.appendChild(nn);
            a.node.parentNode.removeChild(a.node);
        });
    }
    
    async renderTree($container) {
        var self = this;
        this.$top_container = $container;
        $container.empty();
        var buffers={};
        var bufferlist=[];
        buffers["urn:scrapbook:root"] = new NodeHTMLBuffer("", "");        
        try{
            var sec = 0;
            await this.iterateLiNodes(function (json) {
                var parentId = json.parentId || "urn:scrapbook:root";
                var bf;
                switch (json.nodeType) {
                case "seq":
                    bf = self.createFolder(null, json.id, null, json.title);
                    break;
                case "bookmark":
                case "page":
                    bf = self.createLink(null, json.type, json.id, null, json.source, json.icon, json.title);
                    break;
                case "separator":
                    sec++;
                    bf = self.createSeparator(null, json.id, null);
                    break;
                }
                if(bf){
                    var title = (json.title || "").toLowerCase();
                    var id = json.id;
                    bufferlist.push({id, bf, title, parentId, sec});
                }
                if(json.nodeType == "separator"){
                    sec++;
                }
            });
            bufferlist.forEach(function(item){
                buffers[item.id] = item.bf;
                if(buffers[item.parentId])
                    buffers[item.parentId].appendChild(item.bf);
            });
            var html = buffers["urn:scrapbook:root"].flatten();
            $container.html(html);
            this.showCheckBoxes(this.options.checkboxes);
            this.rendered = true;
        }catch(e){
            log.error(e.message);
        }
        this.listenUserEvents($container);
        this.showCheckBoxes(this.options.checkboxes);
    }
    async iterateLiNodes(fn, nodes=null, fn2=null) {
        var self = this;
        
        if(!(nodes instanceof Array))
            nodes = this.getSeqNode("urn:scrapbook:root").children;
        
        var level = 0;
        async function processer(nodes, parentId=null) {
            for (let child of nodes) {
                try{
                    var [nodeType, introNode] = self.getLiNodeType(child);
                    if (nodeType == "seq") { // folder
                        var seqNode = introNode;
                        var about = introNode.getAttributeNS(self.NS_RDF, "about");
                        if (about) {
                            var id = null;
                            var desc_node = self.getDescNode(about);
                            var data;
                            if(desc_node){
                                id = desc_node.getAttributeNS(self.MAIN_NS, "id");
                                var title = desc_node.getAttributeNS(self.MAIN_NS, "title").htmlDecode(); // temporary solution for html entity
                                desc_node.setAttributeNS(self.MAIN_NS, "title", title);  // temporarily replace html entity
                                data = {
                                    parentId: parentId,
                                    nodeType: 'seq',
                                    id: id,
                                    title: title,
                                    level
                                }
                                await fn(data, child);
                            }
                            level++;
                            await processer(seqNode.children, id);
                            level--;
                            if(fn2 && desc_node)fn2(data, child)
                        }
                    } else if(nodeType == "separator") {
                        var id = child.getAttributeNS(self.NS_RDF, "resource").replace("urn:scrapbook:item", "");
                        await fn({ nodeType: 'separator', id: id, parentId: parentId, level}, child);
                    } else if(nodeType) {   // scrap
                        var title = introNode.getAttributeNS(self.MAIN_NS, "title").htmlDecode(); // temporary solution for html entity
                        introNode.setAttributeNS(self.MAIN_NS, "title", title); // temporarily replace html entity 
                        await fn({
                            parentId: parentId,
                            nodeType: nodeType,
                            id: introNode.getAttributeNS(self.MAIN_NS, "id"),
                            type: nodeType,
                            source: introNode.getAttributeNS(self.MAIN_NS, "source"),
                            icon: introNode.getAttributeNS(self.MAIN_NS, "icon"),
                            title: title,
                            comment: (introNode.getAttributeNS(self.MAIN_NS, "comment") || "").replace(/ __BR__ /g, "\n"),
                            level
                        }, child);
                    }
                }catch(e){
                    log.error("node error: ", nodeType)
                }
            }
        }
        await processer(nodes);
    }
    unlockItem($item){
        $item.removeAttr("disabled");
    }
    updateItemIcon($item, icon) {
        var id = $item.attr("id");
        if(icon){
            $item.find("i").css("background-image", "url(" + this.translateResource(icon, this.rdfPath, id) + ")");
        }else{
            $item.find("i")[0].style.removeProperty("background-image");
        }
        var node = this.getDescNode("urn:scrapbook:item" + id);
        if (node) node.setAttributeNS(this.MAIN_NS, "icon", icon);
        if(this.onXmlChanged)this.onXmlChanged();
    }
    renameItem($item, title) {
        var desc_node = this.getDescNode("urn:scrapbook:item" + $item.attr("id"));
        title = $.trim(title);
        if (desc_node) {
            $item.find("label").html(title.htmlEncode() || "-- UNTITLED --");
            $item.attr("title", title);
            desc_node.setAttributeNS(this.MAIN_NS, "title", title);
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    updateSource($item, source) {
        var desc_node = this.getDescNode("urn:scrapbook:item" + $item.attr("id"));
        source = $.trim(source);
        if (desc_node) {
            $item.attr("source", source);
            desc_node.setAttributeNS(this.MAIN_NS, "source", source);
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    updateComment($item, comment) {
        var desc_node = this.getDescNode("urn:scrapbook:item" + $item.attr("id"));
        comment = $.trim(comment);
        comment = comment.replace(/\n\r/g, "\n");
        comment = comment.replace(/[\n\r]/g, " __BR__ ");
        if(desc_node) {
            desc_node.setAttributeNS(this.MAIN_NS, "comment", comment);
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    updateTag($item, tag) {
        var desc_node = this.getDescNode("urn:scrapbook:item" + $item.attr("id"));
        tag = $.trim(tag);
        if(desc_node) {
            desc_node.setAttributeNS(this.MAIN_NS, "tag", tag);
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }    
    getItemPath($item, separator=' / ') {
        var ar = [$item.find("label").html()];
        while($item){
            $item = this.getParentFolderItem($item);
            if($item){
                ar.push($item.find("label").html());
            }
        }
        return separator + ar.reverse().join(separator);
    }
    getParentFolderItem($item) {
        if (!$item.length)
            return null;
        var $f = $item.parent(".folder-content").prev(".item.folder");
        return $f.length ? $f : null;
    }
    getContainerFolderId($container) {
        if (!$container.length)
            return "";
        return $container.prev(".item.folder").attr("id");
    }
    getItemById(id, $container=null){
        if($container)
            return this.$container.find("#"+id);
        else
            return this.$top_container.find("#"+id);
    }
    getContainerById(id) {
        if(id == "urn:scrapbook:root")
            return this.$top_container;
        var $item = this.getItemById(id);
        return $item.next(".folder-content"); 
    }
    focusItem($item){
        this.$top_container.find(".item.focus").removeClass("focus");
        $item.addClass("focus");
    }
    getFocusedItem(){
        return this.$top_container.find(".item.focus");
    }
    getCurrRefId(){
        var $f = this.$top_container.find(".item.focus");
        if($f.length){
    	    if(!$f.hasClass("folder")){
    	        return $f.attr("id");
    	    }
        }
    }
    getCurrContainer(){
        var $container;
        var $f = this.$top_container.find(".item.focus");
        if($f.length){
    	    if($f.hasClass("folder")){
    	        $container = $f.nextAll(".folder-content:first");
    	    }else{
    	        $container = $f.parent(".folder-content");
    	    }
        }else{
    	    $container = this.$top_container;
        }
        return $container;
    }
    getCurrFolderId(){
        var $f = this.$top_container.find(".item.focus");
        if($f.hasClass("folder")){
            return $f.attr("id");
        }else{
            var $c = this.getParentFolderItem($f);
            return $c ? $c.attr("id") : null;
        }
    }    
    createLink($container, type, id, ref_id, source, icon, title, wait, is_new_node, comment="", tag="") {
        title = $.trim(title);
        if (wait) icon = "icons/loading.gif";
        /** create item element */
        var title_encode = title.htmlEncode();
        var label = title_encode || "-- UNTITLED --";
        var style="";
        /** show icon */
        if (icon) {
            style = "background-image:url(" + this.translateResource(icon, this.rdfPath, id) + ");";
        }
        var bf = new NodeHTMLBuffer(
            `<div id='${id}' class='item ${type}' title='${title_encode}' source='${source}'><input type='checkbox'/><i style='${style}'/><label>${label}</label>`,
            (type == "page" ? "<div class='origin'></div>" : "") + "</div>");
        if (is_new_node) {
            /** append to dom */
            if(!$container.length)
                $container = this.$top_container;
            var $item = $(bf.flatten());
            if (ref_id) {
                var $ref = this.getItemById(ref_id);
                if($ref.closest($container).length > 0){
                    $item.insertAfter($ref);
                }else{
                    $item.appendTo($container);
                }
            } else {
                $item.appendTo($container);
            }
            /** clicking-lock on waiting item */
            if (wait) $item.attr("disabled", "1");
            /** add new node to doc */    
            var folder_id = this.getContainerFolderId($container);
            this.createScrapXml(folder_id, type, id, ref_id, title, source, wait ? "" : icon, comment, tag);
            this.showCheckBoxes(this.options.checkboxes);
        }        
        return bf;
    }
    createFolder($container, id, ref_id, title, is_new_node) {
        title = $.trim(title);
        var title_encode = title.htmlEncode();
        var label = title_encode || "-- UNTITLED --";
        var bf = new NodeHTMLBuffer(`<div id='${id}' class='item folder' title='${title_encode}'><input type='checkbox'/><i/><label>${label}</label></div>
<div class='folder-content'>`,"</div>");
        if (is_new_node) {
            var $folder = $(bf.flatten());
            if (ref_id) {
                var $ref = this.getItemById(ref_id);
                if($ref.next(".folder-content").length)
                    $ref = $ref.next(".folder-content");
                if($ref.closest($container).length > 0){ /** ensure in container */
                    $folder.insertAfter($ref);
                }else{
                    $folder.appendTo($container);
                }
            } else {
                $folder.appendTo($container);
            }
            var folder_id = this.getContainerFolderId($container);
            this.createFolderXml(folder_id, id, ref_id, title);
            this.showCheckBoxes(this.options.checkboxes);
        }        
        return bf;
    }
    createSeparator($container, id, ref_id, is_new_node) {
        var bf = new NodeHTMLBuffer(`<div id='${id}' class='item separator'/>`, "");
        if (is_new_node) {
            var $hr = $(bf.flatten());
            if (ref_id) {
                $hr.insertAfter($("#" + ref_id)).attr("id", id);
            } else {
                $hr.appendTo($container).attr("id", id);
            }
            var folder_id = this.getContainerFolderId($container);
            this.createSeparatorXml(folder_id, id, ref_id);
        }
        return bf;
    }
    removeItem($item) {
        var self = this;
        var id = $item.attr("id");
        if ($item.hasClass("folder")) {
            $item.nextAll(".folder-content:first").children(".item").each(function () {
                self.removeItem($(this));
            });
            $item.nextAll(".folder-content:first").remove();
        }
        $item.remove();
        if ($item.hasClass("page") || $item.hasClass("bookmark")) {
            if(this.onItemRemoved)this.onItemRemoved(id);
        }
        this.removeItemXml(id);
    }    
    /** =============== xml part =============== */
    getLiNodeType(node){
        var resource = node.getAttributeNS(this.NS_RDF, "resource");
        var seq_node = this.getSeqNode(resource);
        if(seq_node)
            return ["seq", seq_node];
        var separator = this.getSeparatorNode(resource);
        if(separator)
            return ["separator", separator];
        var r = this.getDescNode(resource);
        if (r) {
            var type = r.getAttributeNS(this.MAIN_NS, "type");
            if (!(["page", "bookmark"].includes(type))) type = "page";
            return [type, r];
        }
        return [null, null];
    }    
    getItemXmlNode(id){
        return this.getLiNode("urn:scrapbook:item" + id);
    }
    moveItemXml(id, folder_id, ref_id, move_type) {
        var node = this.getLiNode("urn:scrapbook:item" + id);
        if (node) {
            // log.info(`${id} ${folder_id} ${ref_id} ${move_type}`)
            // log.info(move_type)
            var nn = node.cloneNode();
            var seq_node = this.getSeqNode("urn:scrapbook:item" + folder_id) || this.getSeqNode("urn:scrapbook:root");
            // log.info(seq_node)
            var ref_node = this.getLiNode("urn:scrapbook:item" + ref_id);
            if (move_type == 1) {
                seq_node.insertBefore(nn, ref_node);
            } else if (move_type == 2) {
                seq_node.insertBefore(nn, ref_node.nextElementSibling);
            } else if (move_type == 3) {
                seq_node.appendChild(nn);
            }
            node.parentNode.removeChild(node);
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    removeItemXml(id) {
        var changed = false;
        var about = "urn:scrapbook:item" + id;
        var node = this.getLiNode(about);
        if(node){
            node.parentNode.removeChild(node);
            changed = true;
        }
        [this.desc_node_cache ,this.separator_node_cache ,this.seq_node_cache].forEach(function(buf){
            var node = buf[about];
            if(node){
                node.parentNode.removeChild(node);
                delete buf[about];
                changed = true;
            }
         });
        if(changed){
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    createSeparatorXml(folder_id, id, ref_id) {
        var seq_node = this.getSeqNode("urn:scrapbook:item" + folder_id) || this.getSeqNode("urn:scrapbook:root");
        if (seq_node) {
            var node = this.xmlDoc.createElementNS(this.NS_RDF, "li");
            node.setAttributeNS(this.NS_RDF, "resource", "urn:scrapbook:item" + id);
            if (ref_id) {
                var ref_node = this.getLiNode("urn:scrapbook:item" + ref_id);
                seq_node.insertBefore(node, ref_node.nextSibling);
            } else {
                seq_node.appendChild(node);
            }
            var node = this.xmlDoc.createElementNS(this.NS_NC, "BookmarkSeparator");
            node.setAttributeNS(this.NS_RDF, "about", "urn:scrapbook:item" + id);
            node.setAttributeNS(this.MAIN_NS, "id", id);
            node.setAttributeNS(this.MAIN_NS, "type", "separator");
            this.xmlDoc.documentElement.appendChild(node);
            this.separator_node_cache["urn:scrapbook:item" + id] = node;
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    createScrapXml(folder_id, type, id, ref_id, title, source, icon, comment, tag) {
        var seq_node = this.getSeqNode("urn:scrapbook:item" + folder_id) || this.getSeqNode("urn:scrapbook:root");
        if (seq_node) {
            var node = this.xmlDoc.createElementNS(this.NS_RDF, "li");
            node.setAttributeNS(this.NS_RDF, "resource", "urn:scrapbook:item" + id);
            if (ref_id) {
                var ref_node = this.getLiNode("urn:scrapbook:item" + ref_id);
                seq_node.insertBefore(node, ref_node.nextSibling);
            } else {
                seq_node.appendChild(node);
            }
            var node = this.xmlDoc.createElementNS(this.NS_RDF, "Description");
            node.setAttributeNS(this.NS_RDF, "about", "urn:scrapbook:item" + id);
            node.setAttributeNS(this.MAIN_NS, "id", id);
            node.setAttributeNS(this.MAIN_NS, "type", type);
            node.setAttributeNS(this.MAIN_NS, "title", title);
            node.setAttributeNS(this.MAIN_NS, "chars", "UTF-8");
            node.setAttributeNS(this.MAIN_NS, "comment", comment);
            // node.setAttributeNS(this.MAIN_NS, "tag", tag);
            node.setAttributeNS(this.MAIN_NS, "source", source);
            node.setAttributeNS(this.MAIN_NS, "icon", icon);
            this.xmlDoc.documentElement.appendChild(node);
            this.desc_node_cache["urn:scrapbook:item" + id] = node;
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    createFolderXml(folder_id, id, ref_id, title) {
        var seq_node = this.getSeqNode("urn:scrapbook:item" + folder_id) || this.getSeqNode("urn:scrapbook:root");
        if (seq_node) {
            var node = this.xmlDoc.createElementNS(this.NS_RDF, "li");
            node.setAttributeNS(this.NS_RDF, "resource", "urn:scrapbook:item" + id);
            if (ref_id) {
                var ref_node = this.getLiNode("urn:scrapbook:item" + ref_id);
                seq_node.insertBefore(node, ref_node.nextSibling);
            } else {
                seq_node.appendChild(node);
            }
            var node = this.xmlDoc.createElementNS(this.NS_RDF, "Description");
            node.setAttributeNS(this.NS_RDF, "about", "urn:scrapbook:item" + id);
            node.setAttributeNS(this.MAIN_NS, "id", id);
            node.setAttributeNS(this.MAIN_NS, "type", "folder");
            node.setAttributeNS(this.MAIN_NS, "title", title);
            node.setAttributeNS(this.MAIN_NS, "chars", "UTF-8");
            node.setAttributeNS(this.MAIN_NS, "comment", "");
            this.xmlDoc.documentElement.appendChild(node);
            this.desc_node_cache["urn:scrapbook:item" + id] = node;
            var node = this.xmlDoc.createElementNS(this.NS_RDF, "Seq");
            node.setAttributeNS(this.NS_RDF, "about", "urn:scrapbook:item" + id);
            this.xmlDoc.documentElement.appendChild(node);
            this.seq_node_cache["urn:scrapbook:item" + id] = node;
            if(this.onXmlChanged)this.onXmlChanged();
        }
    }
    xmlSerialized() {
        var serializer = new XMLSerializer();
        var xml = serializer.serializeToString(this.xmlDoc);
        xml = xml.replace(/<[^<\>]+\>/g, function(a){
            return a + "\n";
        });
        xml = xml.replace(/[\n\r]+/g, "\n");
        return xml;
    }
    cacheXmlNode() {
        var search = `//RDF:Description`;
        var result = this.xmlDoc.evaluate(search, this.xmlDoc, this.nsResolver, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
        this.desc_node_cache={};
        var n;
        while(n = result.iterateNext()){
            this.desc_node_cache[n.getAttributeNS(this.NS_RDF, "about")] = n;
        }
        var search = `//RDF:Seq`;
        var result = this.xmlDoc.evaluate(search, this.xmlDoc, this.nsResolver, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
        this.seq_node_cache={};
        var n;
        while(n = result.iterateNext()){
            this.seq_node_cache[n.getAttributeNS(this.NS_RDF, "about")] = n;
        }
        var search = `//NC:BookmarkSeparator`;
        var result = this.xmlDoc.evaluate(search, this.xmlDoc, this.nsResolver, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
        this.separator_node_cache={};
        var n;
        while(n = result.iterateNext()){
            this.separator_node_cache[n.getAttributeNS(this.NS_RDF, "about")] = n;
        }
    }
    getLiNode(about) {
        var search = `//RDF:li[@RDF:resource='${about}']`;
        var result = this.xmlDoc.evaluate(search, this.xmlDoc, this.nsResolver, XPathResult.ANY_UNORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
    }
    getDescNode(about) {
        return this.desc_node_cache[about];
    }
    getSeqNode(about) {
        return this.seq_node_cache[about];
    }
    getSeparatorNode(about) {
        return this.separator_node_cache[about];
    }
    getNameSpaces() {
        var r = {};
        var k;
        for (k in this.xmlDoc.documentElement.attributes) {
            var a = this.xmlDoc.documentElement.attributes[k];
            if (a.prefix == "xmlns")
                r[a.localName] = a.value;
        }
        return r;
    }
}
export { BookTree };
