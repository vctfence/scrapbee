// UBIQUITY; NAMESPACE: Scrapyard; VERSION: 0.1
{

    const DEFAULT_OUTPUT_LIMIT = 50;

    const NODE_TYPE_SHELF = 1;
    const NODE_TYPE_GROUP = 2;
    const NODE_TYPE_BOOKMARK = 3;
    const NODE_TYPE_ARCHIVE = 4;
    const NODE_TYPE_SEPARATOR = 5;
    const ENDPOINT_TYPES = [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK];
    const TODO_STATE_TODO = 1;
    const TODO_STATE_DONE = 2;
    const TODO_STATE_WAITING = 3;
    const TODO_STATE_POSTPONED = 4;
    const TODO_STATE_CANCELLED = 5;
    const DEFAULT_SHELF_NAME = "default";
    const EVERYTHING = "everything";

    function scrapyardSend(message, payload) {
        let msg = Object.assign({type: message}, payload? payload: {})
        return browser.runtime.sendMessage("scrapyard@firefox", msg);
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
        scrapyardSend("SCRAPYARD_LIST_GROUPS").then(groups => {
            if (groups) {
                noun_scrapyard_group._items.length = 0;
                groups.forEach(g => noun_scrapyard_group._items.push(g));
                console.log(noun_scrapyard_group._items);
            }
        })
    }


    function updateTagSuggestions() {
        scrapyardSend("SCRAPYARD_LIST_TAGS").then(tags => {
            if (tags) {
                noun_scrapyard_tag._items.length = 0;
                tags.forEach(t => noun_scrapyard_tag._items.push(t));
            }
        })
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
            types: args.format && args.format.text? args.format.data: null,
            todo_state: args.instrument && args.instrument.text? args.instrument.data: null,
            todo_date:  args.goal && args.goal.text? args.goal.text: null,
            details:  args.subject && args.subject.text? args.subject.text: null,
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
            {role: "format",     nountype: {"group": [NODE_TYPE_GROUP],
                    "bookmark": [NODE_TYPE_BOOKMARK],
                    "archive": [NODE_TYPE_ARCHIVE]},
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
            let payload = unpackArgs(args);
            if (!payload.types)
                payload.types = ENDPOINT_TYPES.concat([NODE_TYPE_GROUP]);

            scrapyardSend("SCRAPYARD_LIST_NODES", payload).then(nodes => {
                console.log(nodes)
                if (!nodes || nodes.length === 0) {
                    pblock.innerHTML = "Bookmarks are empty."
                }
                else {
                    let html = "";
                    let items = [];
                    for (let n of nodes) {
                        let text = "";

                        if (n.type === NODE_TYPE_GROUP) {
                            text = "<img class='n-image' src='/res/icons/folder.png'>"
                                + "<div class='n-group'>" + n.path + "</div>";
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
                            if (nodes[i].type === NODE_TYPE_GROUP) {
                                let path = payload.path? payload.path + "/": "";

                                CmdUtils.setCommandLine("scrapyard from group at " + path + nodes[i].path)
                            }
                            else if (nodes[i].type === NODE_TYPE_ARCHIVE) {
                                scrapyardSend("SCRAPYARD_BROWSE_ARCHIVE", {uuid: nodes[i].uuid});
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

            });

        },
        execute: function(args, {Bin}) {

        }
    });

    let todo_states = {
        [TODO_STATE_TODO]: "TODO",
        [TODO_STATE_WAITING]: "WAITING",
        [TODO_STATE_POSTPONED]: "POSTPONED",
        [TODO_STATE_CANCELLED]: "CANCELLED",
        [TODO_STATE_DONE]: "DONE"
    };

    function bookmarkingCommandPreview(node_type) {
        return function(pblock, args, {Bin}) {
            let {search, path, tags, todo_state, todo_date, details} = unpackArgs(args);

            let title = !CmdUtils.getSelection()
                ? search
                : (CmdUtils.active_tab
                    ? CmdUtils.active_tab.title
                    : null);

            let html = "";

            if (title)
                html += "Bookmark title: <span style='color: #45BCFF;'>" + title + "</span><br>";

            if (path)
                html += "Group: <span style='color: #FD7221;'>" + path + "</span><br>";

            if (tags)
                html += "Tags: <span style='color: #7DE22E;'>" + tags + "</span><br>";

            if (todo_state)
                html += "ToDo state: " + todo_states[todo_state] + "<br>";

            if (todo_date)
                html += "ToDo date: " + todo_date + "<br>";

            if (details)
                html += "Details: " + details + "<br>";


            if (html)
                pblock.innerHTML = html;
        }
    }


    function bookmarkingCommand(node_type) {
        return function(args, {Bin}) {
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

                    scrapyardSend(node_type == NODE_TYPE_BOOKMARK
                        ? "SCRAPYARD_ADD_BOOKMARK"
                        : "SCRAPYARD_ADD_ARCHIVE", payload).then(bookmark => {});
                });
        };
    }

    let noun_type_date = {
        label: "date",
        noExternalCalls: true,
        cacheTime: -1,
        suggest: function (text, html, cb, selectionIndices) {
            let matcher = new RegExp(text, "i");
            let suggs;

            function addZero(text) {
                return (("" + text).length === 1? "0": "") + text;
            }

            suggs = [];

            if (/\d{4}-d{1,2}-d{1,2}/.test(text)) {
                suggs.push(CmdUtils.makeSugg(text, text, null, CmdUtils.matchScore(p.match), selectionIndices));
            }
            else if (/\d{1,2}-\d{1,2}/.test(text)) {
                let now = new Date();
                let [month, day] = text.split("-");
                let date = now.getFullYear() + "-" + addZero(month) + "-" + addZero(day);
                suggs.push(CmdUtils.makeSugg(date, date, null, 1, selectionIndices));
            }
            else if (/\d{1,2}/.test(text)) {
                let now = new Date();
                let date = now.getFullYear() + "-" + addZero(now.getMonth() + 1) + "-" + addZero(text);
                suggs.push(CmdUtils.makeSugg(date, date, null, 1, selectionIndices));
            }

            return suggs;
        }
    };

    CmdUtils.CreateCommand({
        name: "bookmark",
        uuid: "520F182C-34D0-4837-B42A-64A7E859D3D5",
        arguments: [{role: "object",     nountype: noun_arb_text, label: "title"},
            {role: "subject",    nountype: noun_arb_text, label: "details"}, // for
            {role: "goal",       nountype: noun_type_date, label: "due"}, // to
            //{role: "source",     nountype: ["group", "subtree"], label: "depth"}, // from
            //{role: "location",   nountype: noun_arb_text, label: "text"}, // near
            {role: "time",       nountype: noun_scrapyard_group, label: "path"}, // at
            {role: "instrument", nountype: {"TODO": TODO_STATE_TODO,
                    "WAITING": TODO_STATE_WAITING,
                    "POSTPONED": TODO_STATE_POSTPONED,
                    "CANCELLED": TODO_STATE_CANCELLED,
                    "DONE": TODO_STATE_DONE}, label: "todo"}, // with
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
        preview: bookmarkingCommandPreview(NODE_TYPE_BOOKMARK),
        execute: bookmarkingCommand(NODE_TYPE_BOOKMARK)

    });


    CmdUtils.CreateCommand({
        name: "archive",
        uuid: "2CFD7052-84E2-465C-A450-45BFFE3C6C80",
        arguments: [{role: "object",     nountype: noun_arb_text, label: "title"},
            {role: "subject",    nountype: noun_arb_text, label: "details"}, // for
            {role: "goal",       nountype: noun_type_date, label: "due"}, // to
            //{role: "source",     nountype: ["group", "subtree"], label: "depth"}, // from
            //{role: "location",   nountype: noun_arb_text, label: "text"}, // near
            {role: "time",       nountype: noun_scrapyard_group, label: "path"}, // at
            {role: "instrument", nountype: {"TODO": TODO_STATE_TODO,
                    "WAITING": TODO_STATE_WAITING,
                    "POSTPONED": TODO_STATE_POSTPONED,
                    "CANCELLED": TODO_STATE_CANCELLED,
                    "DONE": TODO_STATE_DONE}, label: "todo"}, // with
            //{role: "format",     nountype: noun_arb_text, label: "text"}, // in
            //{role: "modifier",   nountype: noun_arb_text, label: "text"}, // of
            {role: "alias",      nountype: noun_scrapyard_tag, label: "tags"}, // as
            //{role: "cause",      nountype: noun_type_number, label: "amount"}, // by
        ],
        description: "Archvie a web-page or selection to Scrapyard.",
        help: "This text is displayed at the command list page.",
        author: "g/christensen",
        icon: "http://example.com/favicon.png",
        previewDelay: 1000,
        //init: function({Bin}) {},
        //popup: function(doc /* popup document */, {Bin}) {},
        preview: bookmarkingCommandPreview(NODE_TYPE_ARCHIVE),
        execute: bookmarkingCommand(NODE_TYPE_ARCHIVE)

    });


}

