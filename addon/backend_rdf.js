import {settings} from "./settings.js";
import {backend} from "./backend.js";
import {nativeBackend} from "./backend_native.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, RDF_EXTERNAL_NAME} from "./storage_constants.js";

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
        let rdf_url = `http://localhost:${settings.helper_port_number()}/rdf/root/save/${this.uuid}`

        try {
            let content = this._formatXML(this.doc)
            if (content) {
                let form = new FormData();
                form.append("rdf_content", content);
                await fetch(rdf_url, {method: "POST", body: form});
            }
        }
        catch (e) {
            console.log(e);
        }
    }

    static async fromNode(node) {
        const helperApp = nativeBackend.probe(true);
        if (!helperApp)
            return null;

        let xml = null;

        try {
            let response = await fetch(`http://localhost:${settings.helper_port_number()}/rdf/root/${node.uuid}`,
                {method: "GET"});

            if (response.ok) {
                xml = await response.text();
            }
        }
        catch (e) {
            console.log(e);
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

    generateScrapbookId() {
        let d = new Date();

        return d.getFullYear() + ("0"+(d.getMonth()+1)).slice(-2) + ("0" + d.getDate()).slice(-2)
                + ("0" + d.getHours()).slice(-2) + ("0" + d.getMinutes()).slice(-2) + ("0" + d.getSeconds()).slice(-2);
    }

    async createBookmark(node, parent) {
        if (parent.external === RDF_EXTERNAL_NAME) {
            node.external = RDF_EXTERNAL_NAME;
            node.external_id = this.generateScrapbookId();
            await backend.updateNode(node);

            const rdf_doc = await RDFDoc.fromNode(node);
            if (rdf_doc) {
                rdf_doc.addBookmarkNode(node, parent);
                await rdf_doc.write();
            }
        }
    }

    async storeBookmarkData(node_id, data, content_type) {
        let node = await backend.getNode(node_id);

        if (node.external === RDF_EXTERNAL_NAME) {
            await backend.deleteBlob(node_id);

            let item_url = `http://localhost:${settings.helper_port_number()}/rdf/save_item/${node.uuid}`

            try {
                let form = new FormData();
                form.append("item_content", data);
                await fetch(item_url, {method: "POST", body: form});
            }
            catch (e) {
                console.log(e);
            }
        }
    }

    async deleteBookmarks(nodes) {
        if (nodes.some(n => n.external === RDF_EXTERNAL_NAME && !n.external_id))
            return; // do not delete all from root

        let rdf_nodes = nodes.filter(n => n.external === RDF_EXTERNAL_NAME && n.external_id);

        if (rdf_nodes.length) {
            const rdf_doc = await RDFDoc.fromNode(rdf_nodes[0]);
            if (rdf_doc) {
                for (let node of rdf_nodes) {
                    rdf_doc.deleteBookmarkNode(node);

                    if (node.type === NODE_TYPE_ARCHIVE) {
                        let item_url = `http://localhost:${settings.helper_port_number()}/rdf/delete_item/${node.uuid}`

                        try {
                            await fetch(item_url);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                }
                await rdf_doc.write();
            }
        }
    }

    async renameBookmark(node) {
        if (node.external === RDF_EXTERNAL_NAME) {
            const rdf_doc = await RDFDoc.fromNode(node);
            if (rdf_doc) {
                rdf_doc.renameBookmark(node)
                await rdf_doc.write();
            }
        }
    }

    async updateBookmark(node) {
        if (node.external === RDF_EXTERNAL_NAME) {
            const rdf_doc = await RDFDoc.fromNode(node);
            if (rdf_doc) {
                rdf_doc.renameBookmark(node)
                await rdf_doc.write();
            }
        }
    }

    async createBookmarkFolder(node, parent) {
        if (typeof parent !== "object")
            parent = await backend.getNode(parent);

        if (parent && parent.external === RDF_EXTERNAL_NAME) {
            node.external = RDF_EXTERNAL_NAME;
            node.external_id = this.generateScrapbookId();
            await backend.updateNode(node);

            const rdf_doc = await RDFDoc.fromNode(node);
            if (rdf_doc) {
                rdf_doc.createBookmarkFolder(node, parent);
                await rdf_doc.write();
            }
        }
    }

    async moveBookmarks(nodes, dest_id) {
        let rdf_nodes = nodes.filter(n => n.external === RDF_EXTERNAL_NAME);

        if (rdf_nodes.length) {
            let dest = await backend.getNode(dest_id);
            if (dest.external === RDF_EXTERNAL_NAME) {
                const rdf_doc = await RDFDoc.fromNode(dest);
                if (rdf_doc) {
                    rdf_doc.moveNodes(nodes, dest);
                    await rdf_doc.write();
                }
            }
        }
    }

    async reorderBookmarks(nodes) {
        let rdf_nodes = nodes.filter(n => n.external === RDF_EXTERNAL_NAME);
        if (rdf_nodes.length) {
            const rdf_doc = await RDFDoc.fromNode(nodes[0]);
            if (rdf_doc) {
                rdf_doc.reorderNodes(nodes);
                await rdf_doc.write();
            }
        }
    }
}

export let rdfBackend = new RDFBackend();
