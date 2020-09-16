/************************************************************************/
/*                                                                      */
/*      Save Page WE - Generic WebExtension - Content Pages             */
/*                                                                      */
/*      Javascript for Saving Content Pages (all frames)                */
/*                                                                      */
/*      Last Edit - 13 Aug 2019                                         */
/*                                                                      */
/*      Copyright (C) 2016-2019 DW-dev                                  */
/*                                                                      */
/*      Distributed under the GNU General Public License version 2      */
/*      See LICENCE.txt file and http://www.gnu.org/licenses/           */
/*                                                                      */
/************************************************************************/

/************************************************************************/
/*                                                                      */
/* Refer to Google Chrome developer documentation:                      */
/*                                                                      */
/*  https://developer.chrome.com/extensions/content_scripts             */
/*  https://developer.chrome.com/extensions/messaging                   */
/*                                                                      */
/*  https://developer.chrome.com/extensions/match_patterns              */
/*                                                                      */
/*  https://developer.chrome.com/extensions/runtime                     */
/*  https://developer.chrome.com/extensions/storage                     */
/*                                                                      */
/************************************************************************/

/* Loaded into all iframes and frames of all content pages */

/* Shares global variable/function namespace with other content scripts */

/* Use wrapper function to separate namespace from main content script */

//"use strict";

frameScript();

function frameScript()
{

/************************************************************************/

/* Global variables */

/************************************************************************/

/* Initialize on script load */

if (document.readyState != "loading") onLoadPage();
else
{
    window.addEventListener("load",
    function(event)
    {
        if (document.readyState != "loading") onLoadPage();
    },false);
}

/************************************************************************/

/* Initialize on page load */

function onLoadPage()
{
    /* Add listeners */

    addListeners();
}

/************************************************************************/

/* Add listeners */

function addListeners()
{
    /* Message received listener */
    chrome.runtime.onMessage.addListener(
    function(message,sender,sendResponse)
    {
        var i,key,win,parentwin,doctype,htmltext;
        var loadedfonts = new Array();

        switch (message.type)
        {
            /* Messages from background page */

            case "requestFrames":
                markFrames(0,window,document.documentElement);

                key = "";
                win = document.defaultView;
                parentwin = win.parent;

                while (win != window.top)
                {
                    for (i = 0; i < parentwin.frames.length; i++)
                    {
                      if (parentwin.frames[i] == win) break;
                    }

                    key = "-" + i + key;
                    win = parentwin;
                    parentwin = parentwin.parent;
                }

                key = "0" + key;

                document.fonts.forEach(  /* CSS Font Loading Module */
                function(font)
                {
                    if (font.status == "loaded")  /* font is being used in this document */
                    {
                        loadedfonts.push({ family: font.family, weight: font.weight, style: font.style, stretch: font.stretch });
                    }
                });

                doctype = document.doctype;

                if (doctype != null)
                {
                    htmltext = '<!DOCTYPE ' + doctype.name + (doctype.publicId ? ' PUBLIC "' + doctype.publicId + '"' : '') +
                               ((doctype.systemId && !doctype.publicId) ? ' SYSTEM' : '') + (doctype.systemId ? ' "' + doctype.systemId + '"' : '') + '>';
                }
                else htmltext = "";

                htmltext += document.documentElement.outerHTML;

                htmltext = htmltext.replace(/<head([^>]*)>/,"<head$1><base href=\"" + document.baseURI + "\">");

                chrome.runtime.sendMessage({ type: "replyFrameRelay", key: key, url: document.baseURI, html: htmltext, fonts: loadedfonts });

                break;
        }
    });
}

/************************************************************************/

/* Identify frames */

function markFrames(depth,frame,element)
{
    var i,key,win,parentwin;

    /* Handle nested frames and child elements */

    if (element.localName == "iframe" || element.localName == "frame")  /* frame elements */
    {
        key = "";
        win = element.contentWindow;
        parentwin = win.parent;

        while (win != window.top)
        {
            for (i = 0; i < parentwin.frames.length; i++)
            {
              if (parentwin.frames[i] == win) break;
            }

            key = "-" + i + key;
            win = parentwin;
            parentwin = parentwin.parent;
        }

        key = "0" + key;

        element.setAttribute("data-savepage-key",key);

        try
        {
            if (element.contentDocument.documentElement != null)  /* in case web page not fully loaded before naming */
            {
                markFrames(depth+1,element.contentWindow,element.contentDocument.documentElement);
            }
        }
        catch (e)  /* attempting cross-domain web page access */
        {
        }
    }
    else
    {
        for (i = 0; i < element.children.length; i++)
            if (element.children[i] != null)  /* in case web page not fully loaded before finding */
                markFrames(depth,frame,element.children[i]);
    }
}

/************************************************************************/

}
