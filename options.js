import {msg_hub, log, settings} from "/global.js"

function getAsync(file) {
    var r;
    var z, i, elmnt, file, xhttp;
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
	    if (this.status == 200) {
		r=this.response;
	    }
	    if (this.status == 404) {}
        }
    } 
    xhttp.open("GET", file, false); // async
    xhttp.send();
    return r;
}
window.onload=function(){
    browser.i18n.getAcceptLanguages().then(function(r){
	var lang = "en";
	var ui = browser.i18n.getUILanguage();
	if(r.indexOf(ui) > -1){
	    lang = ui;
	}
	$("#div-help").html(getAsync("_locales/" + lang + "/help.html"))
    })
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();
    $("input[name='add']").click(function(){
	createRdfField("", "");
    });
    function createRdfField(k, v){
	var NAME_I18N = browser.i18n.getMessage("Name");
	var FILE_I18N = browser.i18n.getMessage("File");
	var $el = $(`<div>${NAME_I18N}: <input type="text" name="name"/> \
${FILE_I18N}: <input type="text" name="value"/> \
<input type="button" name="del" value="-" /></div>`).appendTo($("#rdf-area"));
	$el.find("input[name=name]").val(k);
	$el.find("input[name=value]").val(v);
	$el.find("input[name=del]").click(function(){
	    $(this).parent().remove();
	});
    }
    $("input[name='save']").click(function(){
	try{
	    var names=[];
	    var paths=[];
	    $("#rdf-area div input:first-child").each(function(){
		var t = $.trim(this.value);
		names.push(t+"\n");
		paths.push($.trim($(this).next("input").val())+"\n");
	    });
	    settings.set('rdf_path_names', names.join(""));
	    settings.set('rdf_paths', paths.join(""));
	    settings.set('backend_port', $("input[name=backend_port]").val());
	    settings.set('bg_color', $("input[name=bg_color]").val());
	    settings.set('font_color', $("input[name=font_color]").val());
	    settings.set('separator_color', $("input[name=separator_color]").val());
	    settings.set('bookmark_color', $("input[name=bookmark_color]").val());
	    settings.set('open_in_current_tab', $("input[name=open_in_current_tab]").is(":checked")?"on":"off")
	    alert("Save success")
	}catch(e){
		alert("Save failed")
	}
    });
    var paths = settings.getRdfPaths();
    if(paths){
	settings.getRdfPathNames().forEach(function(k, i){
	    createRdfField(k, paths[i]);
	});
    }
    $("input[name=bg_color]").val(settings.bg_color);
    $("input[name=font_color]").val(settings.font_color);
    $("input[name=separator_color]").val(settings.separator_color);
    $("input[name=bookmark_color]").val(settings.bookmark_color);
    $("input[name=backend_port]").val(settings.backend_port);
    $("input[name=open_in_current_tab]").prop("checked", settings.open_in_current_tab=="on")
    if(settings.backend_path){
	$("#txtBackendPath").show();
	$("#txtBackendPath").html("{ALREADY_DOWNLOADED_TO}: ".translate() + settings.backend_path);
    }
    function applyArea(){
	$(".div-area").hide();
	$("a.left-index").removeClass("focus")
	var m;
	if(m=location.href.match(/#(\w+)$/)){
	    $("#div-"+m[1]).show();
	    $("a.left-index[href='#" + m[1] + "']").addClass("focus")
	}else{
	    $("#div-settings").show();
	    $("a.left-index[href='#settings']").addClass("focus")
	}
    }
    window.onhashchange=()=>applyArea();
    applyArea()
    $("#donate").click(()=>window.open('http://PayPal.me/VFence', '_blank'));
    $("#btnDownloadBackend").click(function(){
	function Next(){
		const extRoot = "moz-extension://" + settings.extension_id;
	    var src_exec = "scrapbee_backend";
	    if(settings.platform=="mac")
		src_exec += "_mac"
	    else if(settings.platform=="linux")
		src_exec += "_lnx"
	    src_exec += settings.platform=="windows"?".exe":"";
	    var dest_exec = "scrapbee_backend" + (settings.platform=="windows"?".exe":"");
	    browser.downloads.download({
    		url: extRoot + "/bin/" + src_exec,
    		filename: "scrapbee/" + dest_exec,
    		conflictAction: "overwrite",
			saveAs: false
	    }).then(id => { // TODO: 优化逻辑和注释
		// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/DownloadItem
		browser.downloads.search({id: id}).then((downloads) => {
		    var fn = function(downloadDelta){
			if(downloadDelta.id == id && (downloadDelta.state && downloadDelta.state.current == "complete")){
			    browser.downloads.onChanged.removeListener(fn);
			    var filename = downloads[0].filename;
			    $("#txtBackendPath").val(filename);
			    var json = {"allowed_extensions":["scrapbee@scrapbee.org"],
					"description":"Scrapbee backend",
					"name":"scrapbee_backend",
					"path":filename,
					"type":"stdio"}
			    downloadJsonText(json, "scrapbee/scrapbee_backend.json", function(){
				function done(){
				    settings.set('backend_path', filename.replace(/[^\\\/]*$/,""));
				    if(settings.backend_path){
					$("#txtBackendPath").html("{ALREADY_DOWNLOADED_TO}: ".translate() + settings.backend_path);
				    }
				}
				if(settings.platform=="windows")
				    downloadFile(extRoot + "/install/install.bat", "scrapbee/install.bat", done);
				else if(settings.platform=="mac")
				    downloadFile(extRoot + "/install/install_mac.sh", "scrapbee/install.sh", done);
				else
				    downloadFile(extRoot + "/install/install_lnx.sh", "scrapbee/install.sh", done);
			    });
			}
		    }
		    browser.downloads.onChanged.addListener(fn);
		}).catch( function(error){ // TODO: not works
			$("#txtBackendPath").html("error: " + error);
		});
		}).catch(function (error) { // TODO: catch if exec file not exits
			$("#txtBackendPath").html("error: " + error);
	    });
	}
	$("#txtBackendPath").show();
	$("#txtBackendPath").html("Downloading...") // todo: error output
	setTimeout(Next, 1000);
    });
    function downloadFile(src, dest, callback){
	browser.downloads.download({
	    url:src,
	    filename: dest,
	    conflictAction: "overwrite",
	    saveAs: false
	}).then(function(id){
	    var fn = function(downloadDelta){
		if(downloadDelta.id == id && (downloadDelta.state && downloadDelta.state.current == "complete")){
		    browser.downloads.onChanged.removeListener(fn);
		    callback && callback()
		}
	    }
	    browser.downloads.onChanged.addListener(fn);
	});
    }
    function downloadJsonText(json, filename, callback){
	var jstr = JSON.stringify(json, null, 2)
	var blob = new Blob([jstr], {type : 'text/plain'});
	var objectURL = URL.createObjectURL(blob);
	browser.downloads.download({
	    url:objectURL,
	    filename: filename,
	    conflictAction: "overwrite",
	    saveAs: false
	}).then(function(id){
	    var fn = function(downloadDelta){
		if(downloadDelta.id == id && (downloadDelta.state && downloadDelta.state.current == "complete")){
		    browser.downloads.onChanged.removeListener(fn);
		    URL.revokeObjectURL(objectURL);
		    callback && callback()
		}
	    }
	    browser.downloads.onChanged.addListener(fn);
	});
    }
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	var $div = $("#div-log .console");
	if(request.type == 'LOGGING'){
	    var b = Math.abs($div.scrollTop() - ($div[0].scrollHeight - $div.height())) < 100;
	    $("<div/>").appendTo($div).html(request.log.logtype + ": " +request.log.content);
	    if(b)
		$div.scrollTop($div[0].scrollHeight - $div.height());
	}
    });
    msg_hub.send('GET_ALL_LOG_REQUEST', '', function(response){
	var $div = $("#div-log .console");
	$("<div/>").appendTo($div).html(response.logs.replace(/\n/g, "<br/>"));
    });
}
