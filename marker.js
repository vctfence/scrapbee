function getTextNodesBetween(rootNode, startNode, endNode) {
    var pastStartNode = false, reachedEndNode = false, textNodes = [];
    function getTextNodes(node) {
        if (node == startNode) {
            pastStartNode = true;
        } else if (node == endNode) {
            reachedEndNode = true;
        } else if (node.nodeType == 3) {
            if (pastStartNode && !reachedEndNode && !/^\s*$/.test(node.nodeValue)) {
                textNodes.push(node);
            }
        } else {
            for (var i = 0, len = node.childNodes.length; !reachedEndNode && i < len; ++i) {
                getTextNodes(node.childNodes[i]);
            }
        }
    }
    if(startNode != endNode)
        getTextNodes(rootNode);
    return textNodes;
}

function surround(txnode, tag, cls, start_offset, end_offset){
    var textRange = document.createRange();
    var el = document.createElement(tag);
    el.className=cls;
    if(Number.isInteger(start_offset) && Number.isInteger(end_offset)){
        textRange.setStart(txnode, start_offset);
        textRange.setEnd(txnode, end_offset);
    }else{
        textRange.selectNodeContents(txnode);
    }
    textRange.surroundContents(el); /* only work for selection  within textnode */
    textRange.detach()
    return el;
}

function getCurrSelection(){
    var selection = {}
    selection.range = window.getSelection().getRangeAt(0);
    selection.parent = selection.range.commonAncestorContainer; /* element */

    /* these can be only text nodes for selection made by user */
    selection.start = selection.range.startContainer; /* textnode */
    selection.end = selection.range.endContainer; /* textnode */
    
    return selection;
}

function clearMarkPen(){
    var selection = getCurrSelection()
    $(selection.parent).find(".scrapbee-mark-pen").each(function(){
        if(selection.range.intersectsNode(this))
            $(this).replaceWith($(this).text());
    });
}

function mark(hlclass){
    var hltag="span";
    hlclass = "scrapbee-mark-pen " + hlclass;

    var selection = getCurrSelection()
    
    /* there are maybe text nodes between start and end (range cross more than one tag) */
    getTextNodesBetween(selection.parent, selection.start, selection.end).forEach(function(tn){
        surround(tn, hltag, hlclass)
    });

    /* surround edges */
    if(selection.start == selection.end){
        /** range in single text node */
        var span = surround(selection.start, hltag, hlclass, selection.range.startOffset, selection.range.endOffset);
        selection.range.setStart(span.firstChild, 0)
        selection.range.setEnd(span.firstChild, span.firstChild.nodeValue.length)
    }else{
        var span1 = surround(selection.start, hltag, hlclass, selection.range.startOffset, selection.start.nodeValue.length);
        var span2 = surround(selection.end, hltag, hlclass, 0, selection.range.endOffset);
        selection.range.setStart(span1.firstChild, 0)
        selection.range.setEnd(span2.firstChild, span2.firstChild.nodeValue.length)
    }
}
