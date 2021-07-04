import UUID from "./lib/uuid.js";
import {bookmarkManager} from "./backend.js";
import {nativeBackend} from "./backend_native.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, RDF_EXTERNAL_NAME} from "./storage.js";

class RDFDoc {

    ns_resolver(ns) {
        return this.namespaces.get(ns);
    }

    xselect(path) {
        return this.doc.evaluate(path, this.doc, ns => this.ns_resolver(ns), XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    }

    _xpathToArray(xpathResult)
    {
        let results = [];
        for (let i = 0, length = xpathResult.snapshotLength; i < length; ++i) {
            results.push(xpathResult.snapshotItem(i));
        }
        return results;
    }

    _unique(xpathResult) {
        if (xpathResult.snapshotLength)
            return xpathResult.snapshotItem(0)

        return null;
    }

    _formatXML(doc) {
        let xml = new XMLSerializer().serializeToString(doc.documentElement);
        xml = xml.replace(/<[^<\>]+\>/g, function(a){
            return a + "\n";
        });
        xml = xml.replace(/[\n\r]+/g, "\n");
        return xml;
    }

    async write () {
        try {
            let content = this._formatXML(this.doc)
            if (content)
                await nativeBackend.post(`/rdf/root/save/${this.uuid}`, {rdf_content: content});
        }
        catch (e) {
            console.error(e);
        }
    }

    static async fromNode(node) {
        const helperApp = nativeBackend.probe(true);
        if (!helperApp)
            return null;

        let xml = null;

        try {
            xml = await nativeBackend.fetchText(`/rdf/root/${node.uuid}`);
        }
        catch (e) {
            console.error(e);
        }

        if (!xml)
            return null;

        let instance = new RDFDoc();

        instance.uuid = node.uuid;

        let doc = instance.doc = new DOMParser().parseFromString(xml, 'application/xml');

        instance.namespaces = new Map(Object.values(doc.documentElement.attributes)
            .map(a => [a.localName, a.prefix === "xmlns"? a.value: null]));
        instance.NS_NC = instance.ns_resolver("NC");
        instance.NS_RDF = instance.ns_resolver("RDF");
        instance.NS_SCRAPBOOK = instance.ns_resolver(Array.from(instance.namespaces.keys()).find(k => (/NS\d+/i).test(k)));

        return instance;
    }

    addBookmarkNode(node, parent) {
        let xmlNode = this.doc.createElementNS(this.NS_RDF, "Description");
        xmlNode.setAttributeNS(this.NS_RDF, "about", `urn:scrapbook:item${node.external_id}`);
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "id", node.external_id);
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "type", "");
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "title", node.name);
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "chars", "");
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "icon", "");
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "source", node.uri);
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "comment", "");
        this.doc.documentElement.appendChild(xmlNode)

        let query = `//RDF:Seq[@RDF:about='urn:scrapbook:item${parent.external_id}']`;
        if (!parent.external_id)
            query = `//RDF:Seq[@RDF:about='urn:scrapbook:root']`;

        let seqNode = this._unique(this.xselect(query));

        let liNode = this.doc.createElementNS(this.NS_RDF, "li");
        liNode.setAttributeNS(this.NS_RDF, "resource", `urn:scrapbook:item${node.external_id}`);

        if (seqNode)
            seqNode.appendChild(liNode);

        return xmlNode
    }

    deleteBookmarkNode(node) {
        let query = node.type === NODE_TYPE_SEPARATOR
            ? `//NC:BookmarkSeparator[@RDF:about='urn:scrapbook:item${node.external_id}']`
            : `//RDF:Description[@RDF:about='urn:scrapbook:item${node.external_id}']`;
        let xmlNode = this._unique(this.xselect(query));
        if (xmlNode)
            xmlNode.parentNode.removeChild(xmlNode);

        query = `//RDF:li[@RDF:resource='urn:scrapbook:item${node.external_id}']`;
        let liNode = this._unique(this.xselect(query));
        if (liNode)
            liNode.parentNode.removeChild(liNode);

        if (node.type === NODE_TYPE_GROUP) {
            query = `//RDF:Seq[@RDF:about='urn:scrapbook:item${node.external_id}']`;
            let seqNode = this._unique(this.xselect(query));
            if (seqNode)
                seqNode.parentNode.removeChild(seqNode);
        }
    }

    renameBookmark(node) {
        let query = `//RDF:Description[@RDF:about='urn:scrapbook:item${node.external_id}']`;
        let xmlNode = this._unique(this.xselect(query));
        if (xmlNode)
            xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "title", node.name);
    }

    updateBookmark(node) {
        let query = `//RDF:Description[@RDF:about='urn:scrapbook:item${node.external_id}']`;
        let xmlNode = this._unique(this.xselect(query));
        if (xmlNode)
            xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "title", node.name);
    }

    createBookmarkFolder(node, parent) {
        let xmlNode = this.addBookmarkNode(node, parent);

        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "type", "folder");
        xmlNode.setAttributeNS(this.NS_SCRAPBOOK, "source", "");

        let seqNode = this.doc.createElementNS(this.NS_RDF, "Seq");
        seqNode.setAttributeNS(this.NS_RDF, "about", `urn:scrapbook:item${node.external_id}`);
        this.doc.documentElement.appendChild(seqNode)
    }

    moveNodes(nodes, dest) {
        let query = `//RDF:Seq[@RDF:about='urn:scrapbook:item${dest.external_id}']`;
        let seqNode = this._unique(this.xselect(query));
        if (seqNode) {
            for (let node of nodes) {
                let query = `//RDF:li[@RDF:resource='urn:scrapbook:item${node.external_id}']`;
                let liNode = this._unique(this.xselect(query));
                if (liNode) {
                    liNode.parentNode.removeChild(liNode);
                    seqNode.appendChild(liNode);
                }
            }
        }
    }

    reorderNodes(nodes) {
        let query = `//RDF:li[@RDF:resource='urn:scrapbook:item${nodes[0].external_id}']`;
        let liNode = this._unique(this.xselect(query));
        if (liNode) {
            let seq = liNode.parentNode;
            let children = [];
            for (let i = 0; i < seq.childNodes.length; i++) {
                if (seq.childNodes[i].localName === "li")
                    children.push(seq.childNodes[i]);
            }
            for (let i = 0; i < children.length; i++) {
                seq.removeChild(children[i]);
            }

            for (let i = 0; i < seq.childNodes.length; i++) {
                if (seq.childNodes[i].nodeType === 3)
                    seq.removeChild(seq.childNodes[i]);
            }

            for (let node of nodes) {
                let pos = children.find(c => c.getAttributeNS(this.NS_RDF, "resource").endsWith(node.external_id))
                if (pos)
                    seq.appendChild(pos);
            }
        }
    }
}

export class RDFBackend {
    constructor() {
    }

    async createBookmark(node, parent) {
        if (parent.external === RDF_EXTERNAL_NAME) {
            node.external = RDF_EXTERNAL_NAME;
            node.external_id = UUID.date();
            await bookmarkManager.updateNode(node);

            const rdf_doc = await RDFDoc.fromNode(node);
            if (rdf_doc) {
                rdf_doc.addBookmarkNode(node, parent);
                await rdf_doc.write();
            }
        }
    }

    async storeBookmarkData(node_id, data) {
        let node = await bookmarkManager.getNode(node_id);

        if (node.external === RDF_EXTERNAL_NAME) {
            await bookmarkManager.deleteBlob(node_id);

            try {
                await nativeBackend.post(`/rdf/save_item/${node.uuid}`, {item_content: data});
            }
            catch (e) {
                console.error(e);
            }
        }
    }

    async deleteBookmarks(nodes) {
        if (nodes.some(n => n.external === RDF_EXTERNAL_NAME && !n.external_id))
            return; // do not delete all from root

        let rdfNodes = nodes.filter(n => n.external === RDF_EXTERNAL_NAME && n.external_id);

        if (rdfNodes.length) {
            const rdf_doc = await RDFDoc.fromNode(rdfNodes[0]);
            if (rdf_doc) {
                for (let node of rdfNodes) {
                    rdf_doc.deleteBookmarkNode(node);

                    if (node.type === NODE_TYPE_ARCHIVE) {
                        try {
                            await nativeBackend.fetch(`/rdf/delete_item/${node.uuid}`);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
                await rdf_doc.write();
            }
        }
    }

    async renameBookmark(node) {
        if (node.external === RDF_EXTERNAL_NAME) {
            const rdfDoc = await RDFDoc.fromNode(node);
            if (rdfDoc) {
                rdfDoc.renameBookmark(node)
                await rdfDoc.write();
            }
        }
    }

    async updateBookmark(node) {
        if (node.external === RDF_EXTERNAL_NAME) {
            const rdfDoc = await RDFDoc.fromNode(node);
            if (rdfDoc) {
                rdfDoc.renameBookmark(node)
                await rdfDoc.write();
            }
        }
    }

    async createBookmarkFolder(node, parent) {
        if (typeof parent !== "object")
            parent = await bookmarkManager.getNode(parent);

        if (parent && parent.external === RDF_EXTERNAL_NAME) {
            node.external = RDF_EXTERNAL_NAME;
            node.external_id = UUID.date();
            await bookmarkManager.updateNode(node);

            const rdfDoc = await RDFDoc.fromNode(node);
            if (rdfDoc) {
                rdfDoc.createBookmarkFolder(node, parent);
                await rdfDoc.write();
            }
        }
    }

    async moveBookmarks(nodes, dest_id) {
        let rdfNodes = nodes.filter(n => n.external === RDF_EXTERNAL_NAME);

        if (rdfNodes.length) {
            let dest = await bookmarkManager.getNode(dest_id);
            if (dest.external === RDF_EXTERNAL_NAME) {
                const rdfDoc = await RDFDoc.fromNode(dest);
                if (rdfDoc) {
                    rdfDoc.moveNodes(nodes, dest);
                    await rdfDoc.write();
                }
            }
        }
    }

    async reorderBookmarks(nodes) {
        let rdfNodes = nodes.filter(n => n.external === RDF_EXTERNAL_NAME && n.external_id);
        if (rdfNodes.length) {
            const rdfDoc = await RDFDoc.fromNode(nodes[0]);
            if (rdfDoc) {
                rdfDoc.reorderNodes(nodes);
                await rdfDoc.write();
            }
        }
    }
}

export let rdfBackend = new RDFBackend();
