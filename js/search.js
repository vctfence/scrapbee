import {settings} from "./settings.js";
import {BookTree} from "./tree.js";
import {getUrlParams} from "./utils.js";
import {History} from "./history.js"

function Queue(maxWorkingTasks, workingFn){
    this.tasks = [];
    this.maxWorkingTasks = maxWorkingTasks;
    this.workingTasks = 0;
    this.workingFn = workingFn;
    this.taskCount=0;
    this.doneCount=0;
    this.pause = false;
}
Queue.prototype.addTask=function(task){
    this.tasks.push(task);
    this.taskCount++;
};
Queue.prototype.stop=function(){
    this.exit = true;
}
Queue.prototype.start=function(){
    this.exit = false;
    this.popTask();
};
Queue.prototype.popTask=function(){
    var self = this;
    
    if(this.doneCount == this.taskCount || (this.exit && self.workingTasks == 0)){
    	if(this.onfinished)
            this.onfinished();
    }else if(!this.exit){
        while(self.workingTasks < self.maxWorkingTasks){
            if(this.pause)
                break;
	    if(!this.tasks.length)
	        break;
	    self.workingTasks++;
	    var t = this.tasks.shift();
	    self.workingFn(t, function(){
	        self.workingTasks--;
	        self.doneCount++;
	        self.popTask();
	    });
        }
    }
};
// ===============================================
function escapeRegExp(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
function loadXml(rdf){
   var searching = $.trim($("#txtSearch").val());
    if(!searching)
	return;
    var search_title, search_body, search_comment;
    var sources = [];
    $("input[type=checkbox][name=source]:checked").each(function(){
        sources.push(this.value);
        if(this.value == 'title'){
            search_title = true;
        }else if(this.value == 'body'){
            search_body = true;
        }else if(this.value == 'comment'){
            search_comment = true;
        }
    });
    new History().load().then((self)=>{
        self.setItem("searching.source", sources.join(","), true);
    });
    if(!(search_title || search_body || search_comment))
        return;
    $("#btnSearch").hide();
    $("#btnStop").show();
    $("img.loading").show();
    var xmlhttp=new XMLHttpRequest();
    xmlhttp.onload = function(r) {
	var tree = new BookTree(r.target.response, rdf);
	processTree(tree, search_title, search_body, search_comment);
    };
    xmlhttp.onerror = function(err) {
	// log.info(`load ${rdf} failed, ${err}`)
    };
    xmlhttp.open("GET", settings.getFileServiceAddress() + rdf, false);
    xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
    xmlhttp.setRequestHeader('cache-control', 'max-age=0');
    xmlhttp.setRequestHeader('expires', '0');
    xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
    xmlhttp.setRequestHeader('pragma', 'no-cache');
    xmlhttp.send();
}
function red(a){
    return "<b style='color:red'>"+a+"</b>";
}
// function extractContent(html) {
//     return body.replace(/<(?:.|\n)*?>/gm, '').replace(/(&nbsp;)+/g, " ").replace(/\s+/g, " ");
//     return (new DOMParser).parseFromString(html, "text/html").documentElement.textContent;
// }
function extractContent(html) {
    var span = document.createElement('span');
    span.innerHTML = html;
    span.querySelectorAll("script").forEach(function(n){
        n.parentNode.removeChild(n);
    });
    span.querySelectorAll("noscript").forEach(function(n){
        n.parentNode.removeChild(n);
    });
    span.querySelectorAll("style").forEach(function(n){
        n.parentNode.removeChild(n);
    });
    return  span.innerText;
}
async function processTree(tree, search_title, search_body, search_comment){
    var searching = escapeRegExp($.trim($("#txtSearch").val()));
    var match_count = 0;
    function seek(item, body){
	var url;
	if(item.type == "page" || item.type == "note"){
	    url = `/html/viewer.html?id=${item.id}&path=${tree.rdfPath}`
	}else{
	    url = item.source;
	}
	var title_matched = false;
	var content_matched = false;
        var comment_matched = false;
	var re = new RegExp(searching, "i");
        var re2 = new RegExp(searching.htmlEncode(), "ig");
        /** title */
        title_matched = search_title && re.test(item.title);
        /** comment */
        comment_matched = search_comment && re.test(item.comment);
        /** content */
        var text = extractContent(body);
        var m = text.match(re);
        content_matched = search_body && (m && m.length > 0);
        /** output */
        /*** title */
        if(title_matched || comment_matched || content_matched){
            var $div = $("<div>").appendTo($("#divResult"));
            $(`<a target='_blank' class='match-title'>`).appendTo($div).html(item.title.htmlEncode().replace(re2, red)).prop("href", url).prepend($(`<img class='icon' src='${item.icon}'>`));
            $(`<a target='_blank' class='locate-button' title='locate in sidebar'></a>`).appendTo($div).click(function(){
                browser.runtime.sendMessage({type: 'LOCATE_ITEM', id: item.id}).then((response) => {
                }).catch((e) => {
                }); 
            });
        }
        /*** comment */
        if((title_matched || comment_matched || content_matched) && item.comment){
	    $(`<div class='match-comment'>`).appendTo($("#divResult")).html(item.comment.htmlEncode().replace(re2, red).replace(/\n/g, "<br>"));
        }
        /*** body */
        if(title_matched || comment_matched || content_matched){
            var $mc;
            if(content_matched){
                var pos1 = Math.max(0, m.index - 50);
	        var pos2 = Math.min(text.length - 1, pos1 + 100);
	        var s = text.substring(pos1, pos2).replace(re2, red);
	        if(pos1 > 0) s = "..." + s;
	        if(pos2 < text.length - 1) s = s + "...";
	        $mc = $("<div class='match-content'>").appendTo($("#divResult")).html(s);
            }else{
                var pos1 = 0;
	        var pos2 = Math.min(text.length, 150);
	        var s = text.substring(pos1, pos2).replace(re2, red);
	        if(pos1 > 0) s = "..." + s;
	        if(pos2 < text.length - 1) s = s + "...";
	        $mc = $("<div class='match-content'>").appendTo($("#divResult")).html(s);
            }
            /*** food link */
            if(item.type != "note")
	        $(`<a target='_blank' class='match-source'>`).appendTo($mc).html(item.source).prop("href", item.source);
	    match_count ++;
	}
    }
    var q = new Queue(50, function(item, callback){
	var url = tree.getItemIndexPage(item.id);
	if(item.type=="page" || item.type=="note"){
	    $.get(url+"&time="+Math.random(),function(r){
		seek(item, r);
		callback();
	    }).fail(function(){
		callback();
	    });
	}else{
	    seek(item, "");
	    callback();
	}
    });

    $("#btnStop").click(()=>{q.stop();});
    
    q.onfinished=function(){
	var i18n_result = browser.i18n.getMessage("RESULTS_FOUND");
	$("<div>").appendTo($("#divResult")).html(match_count + i18n_result);
	// $("#btnSearch").prop("disabled", false);
        $("#btnSearch").show();
        $("#btnStop").hide();
        $("img.loading").hide();
    };
    
    await tree.iterateLiNodes(async function(item){
	if(item.nodeType == "bookmark" || item.nodeType == "page" || item.nodeType == "note"){
            try{
                if(item.icon){
                    item.icon = tree.translateResource(item.icon, tree.rdfPath, item.id);
                }
		q.addTask(item);
            }catch(e){
                console.log(e);
            }
	}
    }, tree.getSeqNode("urn:scrapbook:root").children);
    q.start();
}
$(document).ready(async function(){
    await settings.loadFromStorage();
    new History().load().then((self)=>{
        var sources = (self.getItem("searching.source") || "").split(",");
        $("input[type=checkbox][name=source]").each(function(){
            if(sources.indexOf(this.value) > -1){
                this.setAttribute("checked", "true");
            }
        });
        document.title = document.title.fillData(function(s){
	    return browser.i18n.getMessage(s)  || s;
        });    
        document.body.innerHTML = document.body.innerHTML.fillData(function(s){
	    return browser.i18n.getMessage(s)  || s;
        });
        $("#searchForm").submit(function(){
	    $("#divResult").html("");
	    var rdf = $("#lstRdfs").val();
	    if(rdf)loadXml(rdf);
            return false;
        });
        var params = getUrlParams(location.href);
        var paths = settings.getRdfPaths();
        settings.getRdfPathNames().forEach(function(k, i){
	    $("<option></option>").attr("value", paths[i]).html(k).appendTo($("#lstRdfs")).prop("selected", paths[i] == params.rdf);
        });
    });
});
