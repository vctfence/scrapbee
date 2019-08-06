import {settings} from "./settings.js"
import {BookTree} from "./tree.js"
import {getUrlParams} from "./utils.js"

function Queue(maxWorkingTasks, workingFn){
    this.tasks = [];
    this.maxWorkingTasks = maxWorkingTasks;
    this.workingTasks = 0;
    this.workingFn = workingFn;
    this.taskCount=0;
    this.doneCount=0;
}
Queue.prototype.addTask=function(task){
    this.tasks.push(task);
    this.taskCount++;
}
Queue.prototype.start=function(task){
    this.popWork();
}
Queue.prototype.popWork=function(){
    var self = this;
    // console.log(this.doneCount , this.taskCount)
    if(this.doneCount == this.taskCount){
    	this.onfinished && this.onfinished();
    	return;
    }
    while(self.workingTasks < self.maxWorkingTasks){
	if(!this.tasks.length)
	    break	
	self.workingTasks++;
	var t = this.tasks.shift();
	self.workingFn(t, function(){
	    self.workingTasks--;
	    self.doneCount++;
	    self.popWork();
	});
    }
}
// ===============================================
function escapeRegExp(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}
function loadXml(rdf){
   var searching = $.trim($("#txtSearch").val());
    if(!searching)
	return;
    var search_title, search_body, search_comment;
    $("input[type=checkbox][name=source]:checked").each(function(){
        if(this.value == 'title'){
            search_title = true;
        }else if(this.value == 'body'){
            search_body = true;
        }else if(this.value == 'comment'){
            search_comment = true;
        }
    });
    if(!(search_title || search_body || search_comment))
        return
    $("#btnSearch").prop("disabled", true)
    var xmlhttp=new XMLHttpRequest();
    xmlhttp.onload = function(r) {
	var tree = new BookTree(r.target.response, rdf)
	processTree(tree, search_title, search_body, search_comment)
    };
    xmlhttp.onerror = function(err) {
	// log.info(`load ${rdf} failed, ${err}`)
    };
    xmlhttp.open("GET", settings.backend_url + "file-service/" + rdf, false);
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
async function processTree(tree, search_title, search_body, search_comment){
    var searching = escapeRegExp($.trim($("#txtSearch").val()));
    var match_count = 0;
    function seek(item, body){
	var url;
	if(item.type == "page"){
	    url = tree.getItemIndexPage(item.id);
	}else{
	    url = item.source;
	}
	var title_matched = false;
	var content_matched = false;
        var comment_matched = false;
	var re = new RegExp(searching, "i")
	var re2 = new RegExp(searching, "ig")
        /** title */
        title_matched = search_title && !!(item.title.match(re));
        /** comment */
        comment_matched = search_comment && !!(item.comment.match(re));
        /** content */
        var text = body.replace(/<(?:.|\n)*?>/gm, '').replace(/(&nbsp;)+/g, " ").replace(/\s+/g, " ");
        var m = text.match(re);
        content_matched = search_body && !!(m);
        /** output */
        /*** title */
        if(title_matched || comment_matched || content_matched){
            var $div = $("<div>").appendTo($("#divResult"));
            $(`<a target='_blank' class='match-title'>`).appendTo($div).html(item.title.replace(re2, red)).prop("href", url).prepend($(`<img class='icon' src='${item.icon}'>`))
            $(`<a target='_blank' class='locate-button'>&lt;&lt;</a>`).appendTo($div).click(function(){
                browser.runtime.sendMessage({type: 'LOCATE_ITEM', id: item.id}).then((response) => {
                }).catch((e) => {
                }); 
            });
        }
        /*** comment */
        if((title_matched || comment_matched || content_matched) && item.comment){
	    $(`<div class='match-comment'>`).appendTo($("#divResult")).html(item.comment.replace(re2, red).replace(/\n/g, "<br>"))
        }
        /*** body */
        if(title_matched || comment_matched || content_matched){
            if(content_matched){
                var pos1 = Math.max(0, m.index - 50)
	        var pos2 = Math.min(text.length - 1, pos1 + 100);
	        var s = text.substring(pos1, pos2).replace(re2, red);
	        if(pos1 > 0) s = "..." + s;
	        if(pos2 < text.length - 1) s = s + "...";
	        $("<div class='match-content'>").appendTo($("#divResult")).html(s);
            }else{
                var pos1 = 0
	        var pos2 = Math.min(text.length, 150);
	        var s = text.substring(pos1, pos2).replace(re2, red);
	        if(pos1 > 0) s = "..." + s;
	        if(pos2 < text.length - 1) s = s + "...";
	        $("<div class='match-content'>").appendTo($("#divResult")).html(s);
            }
        }
        /*** food link */
	if(title_matched || content_matched || comment_matched){
	    $(`<a target='_blank' class='match-source'>`).appendTo($("#divResult")).html(item.source).prop("href", item.source)
	    match_count ++;
	}
    }
    var q = new Queue(50, function(item, callback){
	var url = tree.getItemIndexPage(item.id);
	if(item.type=="page"){
	    $.get(url+"?time="+Math.random(),function(r){
		seek(item, r)
		callback();
	    }).fail(function(){
		callback();
	    });
	}else{
	    seek(item, "")
	    callback();
	}
    });
    q.onfinished=function(){
	var i18n_result = browser.i18n.getMessage("RESULTS_FOUND")
	$("<div>").appendTo($("#divResult")).html(match_count + i18n_result)
	$("#btnSearch").prop("disabled", false)
    }
    await tree.iterateLiNodes(async function(item){
	if(item.nodeType == "bookmark" || item.nodeType == "page"){
            try{
                if(item.icon){
                    item.icon = tree.translateResource(item.icon, tree.rdf_path, item.id)
                }
		q.addTask(item);
            }catch(e){
                console.log(e)
            }
	}
    });
    q.start()
}
$(document).ready(async function(){
    await settings.loadFromStorage();
    document.title = document.title.fillData(function(s){
	return browser.i18n.getMessage(s)  || s;
    });    
    document.body.innerHTML = document.body.innerHTML.fillData(function(s){
	return browser.i18n.getMessage(s)  || s;
    });    
    $("#searchForm").submit(function(){
	$("#divResult").html("");
	var rdf = $("#lstRdfs").val();
	if(rdf)loadXml(rdf)
        return false;
    });
    var params = getUrlParams(location.href);
    var paths = settings.getRdfPaths();
    settings.getRdfPathNames().forEach(function(k, i){
	$("<option></option>").attr("value", paths[i]).html(k).appendTo($("#lstRdfs")).prop("selected", paths[i] == params.rdf);
    });
});
