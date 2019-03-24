// UBIQUITY; NAMESPACE: Scrapyard; VERSION: 0.1
{

const SCRAPYARD_BACKEND = "http://localhost:31800";
const SCRAPYARD_USER = "default:default";

const DEFAULT_OUTPUT_LIMIT = 50;


function scrapyardGet(path, success, error) {
    return $.ajax(SCRAPYARD_BACKEND + path, {
        dataType: "json",
        headers: {"X-Scrapyard-Auth": SCRAPYARD_USER},
        success: success,
        error: error
    });
}


function scrapyardPost(path, data, success, error) {
    return $.ajax(SCRAPYARD_BACKEND + path, {
        data: JSON.stringify(data),
        dataType: "json",
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Scrapyard-Auth": SCRAPYARD_USER
        },
        success: success,
        error: error
    });
}


var noun_scrapyard_group = {
    label: "path",
    noExternalCalls: true,
    cacheTime: -1,
    _items: [],
    suggest: function (text, html, cb, selectionIndices) {
        let textSugg;
        let matcher = new RegExp(text, "i");

        let suggs = this._items.filter(i => {
            i.match = matcher.exec(i.path);
            return !!i.match;
        })
        .map(i => CmdUtils.makeSugg(i.path, i.path, null, CmdUtils.matchScore(i.match), 
                                    selectionIndices));
    
        if (textSugg = CmdUtils.makeSugg(text, html, null, .3, selectionIndices))
            suggs.push(textSugg);

        if (suggs.length > 0) {
            cb(suggs);
        }

        return {};
    }
};


var noun_scrapyard_tag = {
    label: "tags",
    noExternalCalls: true,
    cacheTime: -1,
    _items: [],
    suggest: function (text, html, cb, selectionIndices) {
        let textSugg;
        let matcher = new RegExp(text, "i");

        let suggs = this._items.filter(i => {
            i.match = matcher.exec(i.name);
            return !!i.match;
        })
        .map(i => CmdUtils.makeSugg(i.name, i.name, null, CmdUtils.matchScore(i.match), 
                                    selectionIndices));
    
        if (textSugg = CmdUtils.makeSugg(text, html, null, .3, selectionIndices))
            suggs.push(textSugg);

        if (suggs.length > 0) {
            cb(suggs);
        }

        return {};
    }
};


function genericErrorHandler(error) {
    if (error.status)
        CmdUtils.notify("Scrapyard: HTTP error: " + error.status)
    else
        CmdUtils.notify("Cannot contact backend")
}


function updateGroupSuggestions() {
    scrapyardGet("/api/completion/groups", groups => {
        if (groups) {
            noun_scrapyard_group._items.length = 0;
            groups.forEach(g => noun_scrapyard_group._items.push(g));
        }
    }, genericErrorHandler)
}


function updateTagSuggestions() {
    scrapyardGet("/api/completion/tags", tags => {
        if (tags) {
            noun_scrapyard_tag._items.length = 0;
            tags.forEach(t => noun_scrapyard_tag._items.push(t));
        }
    }, genericErrorHandler)
}


function updateCompletion() {
    updateGroupSuggestions();
    updateTagSuggestions();
}


function unpackArgs(args) {
    let result = {
        search: args.object && args.object.text && args.object.text !== "this"? args.object.text: null,
        depth: args.source && args.source.text? args.source.text: null,
        path:  args.time && args.time.text? args.time.text: null,
        tags:  args.alias && args.alias.text? args.alias.text: null,
        limit: args.cause && args.cause.text? args.cause.text: null,
        type:  args.format && args.format.text? args.format.data: null,
    };

    if (!result.limit)
        result.limit = DEFAULT_OUTPUT_LIMIT;
    
    for (let k of Object.keys(result)) {
        if (!result[k])
            delete result[k];
    }
    
    return result;
}


CmdUtils.CreateCommand({
    name: "scrapyard",
    uuid: "F39C4D86-C987-4A8A-8109-8D683C25BE4E",
    arguments: [{role: "object",     nountype: noun_arb_text, label: "title"},
              //{role: "subject",    nountype: noun_arb_text, label: "text"}, // for
              //{role: "goal",       nountype: noun_arb_text, label: "text"}, // to
                {role: "source",     nountype: ["group", "subtree"], label: "depth"}, // from
              //{role: "location",   nountype: noun_arb_text, label: "text"}, // near
                {role: "time",       nountype: noun_scrapyard_group, label: "path"}, // at
              //{role: "instrument", nountype: noun_arb_text, label: "text"}, // with
                {role: "format",     nountype: {"group": 1, "bookmark": 2, "archive": 3}, 
                                     label: "type"}, // in
              //{role: "modifier",   nountype: noun_arb_text, label: "text"}, // of
                {role: "alias",      nountype: noun_scrapyard_tag, label: "tags"}, // as
                {role: "cause",      nountype: noun_type_number, label: "amount"}, // by
    ],
    description: "List and filter Scrapyard bookmarks.",
    help: "This text is displayed at the command list page.",
    author: "g/christensen",
    icon: "http://example.com/favicon.png",
    previewDelay: 1000,
    init: updateCompletion,
    popup: function(doc /* popup document */, {Bin}) {
        if (!noun_scrapyard_group._items.length)
            updateCompletion();
    },
    preview: function(pblock, args, {Bin}) {
        //let {title, depth, path, tags, amount} = unpackArgs(args);
        
        scrapyardPost("/api/list/nodes", unpackArgs(args), nodes => {
            if (!nodes || nodes.length === 0) {
                pblock.innerHTML = "Bookmarks are empty."
            }
            else {
                let html = "";
                let items = [];
                for (let n of nodes) {
                    let text = "";
                                        
                    if (n.type === 1) {
                        n.full_path = (n.shelf === "default"? "": n.shelf) + "/" + n.path;

                        text = "<img class='n-image' src='/res/icons/folder.png'>"
                             + "<div class='n-group'>" + n.full_path + "</div>";
                    }
                    else {
                        if (n.icon) {
                            n.icon = n.icon.replace(/'/g, "\\'");
                            text = "<img class='n-image' src='" + n.icon + "'>"
                        }
                        else
                            text = "<img class='n-image' src='/res/icons/homepage.png'>";
                        
                        
                        if (n.uri && !n.name)
                            text += "<div class='cnt'>" + n.uri + "</div>";
                        else
                            text += "<div class='cnt'><div class='n-title'>" + n.name + "</div>"
                                 +  "<div class='n-url'>" + n.uri + "</div></div>";
                    }
    
                    items.push(text);
                }
    
                CmdUtils.previewList(pblock, items, (i, _) => {
                        if (nodes[i].type === 1) {
                            CmdUtils.setCommandLine("scrapyard from group at " + nodes[i].full_path)
                        }
                        else
                            chrome.tabs.create({"url": nodes[i].uri, active: false});
                    },
                    `.preview-list-item {
                        white-space: nowrap;
                        display: flex;
                        flex-flow: row nowrap;
                        align-content: center;
                    }
                     .preview-list-item > span:nthchild(1) {
                        flex 0 1 auto;
                     }
                     .preview-list-item > span:nthchild(2) {
                        flex 1 1 auto;
                     }
                     .preview-item-text {
                        color: #45BCFF;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        width: 490px;
                        display: flex;
                        flex-flow: row nowrap;
                        align-content: center;
                     }
                     .n-image {
                        width: 16px;
                        height: 16px;
                        float: left;
                        margin-top: 5px;
                        margin-bottom: 5px;
                        margin-right: 5px;
                        display: inline-block;
                        flex: 0 1 auto;
                     }
                     .cnt {
                      flex: 1 1 auto;
                      min-width: 0;
                     }
                     .n-group {
                        color: #FD7221;
                        font-weight: 500;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        width: 490px;
                        flex: 1 1 auto;
                     }
                     .n-url {
                        font-size: x-small;
                        padding-left: 10px;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        color: #FD7221;
                     }
                     .n-title {
                        overflow: hidden;
                        white-space: nowrap;
                        text-overflow: ellipsis;
                     }`
                );
            }

        },
        genericErrorHandler)
         

      
            
    },
    execute: function(args, {Bin}) {
       
    }
});


CmdUtils.CreateCommand({
    name: "bookmark",
    uuid: "520F182C-34D0-4837-B42A-64A7E859D3D5",
    arguments: [{role: "object",     nountype: noun_arb_text, label: "text"},
              //{role: "subject",    nountype: noun_arb_text, label: "text"}, // for
              //{role: "goal",       nountype: noun_arb_text, label: "text"}, // to
              //{role: "source",     nountype: ["group", "subtree"], label: "depth"}, // from
              //{role: "location",   nountype: noun_arb_text, label: "text"}, // near
                {role: "time",       nountype: noun_scrapyard_group, label: "path"}, // at
              //{role: "instrument", nountype: noun_arb_text, label: "text"}, // with
              //{role: "format",     nountype: noun_arb_text, label: "text"}, // in
              //{role: "modifier",   nountype: noun_arb_text, label: "text"}, // of
                {role: "alias",      nountype: noun_scrapyard_tag, label: "tags"}, // as
              //{role: "cause",      nountype: noun_type_number, label: "amount"}, // by
    ],
    description: "Add bookmark to Scrapyard.",
    help: "This text is displayed at the command list page.",
    author: "g/christensen",
    icon: "http://example.com/favicon.png",
    previewDelay: 1000,
    //init: function({Bin}) {},
    //popup: function(doc /* popup document */, {Bin}) {},
    preview: function(pblock, args, {Bin}) {
        let {search, path, tags} = unpackArgs(args);
        
        let title = search
                  ? search
                  : (CmdUtils.active_tab
                        ? CmdUtils.active_tab.title
                        : null);

        let html = "";
        
        if (title)
            html += "Bookmark: <span style='color: #45BCFF;'>" + title + "</span><br>";
        
        if (path)
            html += "Group: <span style='color: #FD7221;'>" + path + "</span><br>";
    
        if (tags)
            html += "Tags: <span style='color: #7DE22E;'>" + tags + "</span>";

        if (html)
            pblock.innerHTML = html;
    },
    execute: function(args, {Bin}) {
        let url = CmdUtils.getLocation();
        
        if (!url) {
            CmdUtils.notify("Scrapyard: cannot obtain page URL");
            return;
        }
        
        chrome.tabs.executeScript(CmdUtils.active_tab.id, {
            code: `function extractIcon() {
                let iconElt = document.querySelector("head link[rel*='icon'], head link[rel*='shortcut']");
                console.log(iconElt.href);
                if (iconElt)
                    return iconElt.href;
            }
            extractIcon();
            `
        }, 
        icon => {
            let payload = unpackArgs(args);
        
            payload.name = payload.search
                      ? payload.search
                      : (CmdUtils.active_tab
                            ? CmdUtils.active_tab.title
                            : null);
            payload.uri = url;
            
            if (icon && icon.length)
                payload.icon = icon[0];
            
            scrapyardPost("/api/add/bookmark", payload, 
                bookmark => {},
                genericErrorHandler);
        });
    }
});
    
}

