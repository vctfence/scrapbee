import {showNotification, sendTabContentMessage} from "/js/utils.js"
import {settings, global} from "/js/settings.js";
import {log} from "/js/message.js";

window.onload=async function(){
    await settings.loadFromStorage();
    
    document.body.innerHTML = document.body.innerHTML.translate();
    $("#btnHelp").click(function(){
        browser.tabs.create({"url": "/html/options.html#area=help"});
        window.close();
    });
    $("#btnSetting").click(function(){
        browser.tabs.create({"url": "/html/options.html"});
        window.close();
    });
    $("#btnTools").click(function(){
        browser.tabs.create({"url": "/html/options.html#area=tools"});
        window.close();
    });
    $("#btnOpenInSidebar").click(function(){
        browser.sidebarAction.open();
        window.close();
    });
    $("#btnCapturePage").click(function(){
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"})
            } else {
                browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
                    sendTabContentMessage(tabs[0], {type: 'SAVE_PAGE_REQUEST'}).then(function(){
                        window.close();
                    }).catch(function(e){
                        window.close();
                    });        
                });        
            }
        });
    });
    $("#btnCaptureSelection").click(function(){
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"})
            } else {
                browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
                    sendTabContentMessage(tabs[0], {type: 'SAVE_SELECTION_REQUEST'}).then(function(){
                        window.close();
                    }).catch(function(e){
                        window.close();
                    });
                });
            }
        });
    });
    $("#btnCaptureTabs").click(function(){
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"})
            }else{
                browser.runtime.sendMessage({type: "CAPTURE_TABS"}).then((url) => {});
            }
            window.close();
        });
    });
    $("#btnCaptureUrl").click(function(){
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"})
            } else {
                browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
                    // sendTabContentMessage(tab, {type: 'SAVE_URL_REQUEST_INJECTED'});
                    browser.runtime.sendMessage(tabs[0], {type: 'SAVE_URL_REQUEST'}).then(function(){
                        window.close();
                    }).catch(function(e){
                        window.close();
                    });
                });
            }
        });
    });
    $("#btnCaptureAdv").click(function(){
        browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
            sendTabContentMessage(tabs[0], {type: 'SAVE_ADVANCE_REQUEST'}).then(function(){
                window.close();
            }).catch(function(e){
                window.close();
            });
        });
    });
    browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
        var url = tabs[0].url;
        var enabled = !(/localhost.+scrapbee/.test(url)) && (/^http(s?):/.test(url) || /^file:/.test(url));
        $("#btnCapturePage").prop("disabled", !enabled);
        $("#btnCaptureSelection").prop("disabled", !enabled);
        $("#btnCaptureUrl").prop("disabled", !enabled);
        $("#btnCaptureAdv").prop("disabled", !enabled)
    });
}
