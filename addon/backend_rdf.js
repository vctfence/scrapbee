import UUID from "./lib/uuid.js";
import {nativeBackend} from "./backend_native.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, RDF_EXTERNAL_NAME} from "./storage.js";
import {Archive, Node} from "./storage_entities.js";
import {Path} from "./path.js";
import {RDFNamespaces} from "./utils_html.js";

class RDFDoc {

    xselect(xpath) {
        return this.doc.evaluate(xpath, this.doc, this._xmlNamespaces.resolver,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
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

    _selectFirst(xpath) {
        return this._unique(this.xselect(xpath));
    }

    _formatXML(doc) {
        let xml = new XMLSerializer().serializeToString(doc.documentElement);
        let formatted = "", indent= "";
        const tab = "  ";

        xml.split(/>\s*</).forEach(function(node) {
            if (node.match( /^\/\w/ ))
                indent = indent.substring(tab.length);

            formatted += indent + "<" + node + ">\r\n";

            if (node.match( /^<?\w[^>]*[^\/]$/ ))
                indent += tab;
        });

        return formatted.substring(1, formatted.length - 3);
    }

    async write () {
        try {
            let content = this._formatXML(this.doc)
            if (content) {
                await nativeBackend.post(`/rdf/xml/save/${this.uuid}`,
                    {rdf_content: content, rdf_file: this.path});
            }
        }
        catch (e) {
            console.error(e);
        }
    }

    static async fromNode(node) {
        const helperApp = await nativeBackend.hasVersion("0.5");
        if (!helperApp)
            return null;

        const rdf_path = `${(await Path.compute(node))[0].uri}/scrapbook.rdf`;

        let xml = null;

        try {
            const resp = await nativeBackend.post(`/rdf/xml/${node.uuid}`, {rdf_file: rdf_path});

            if (!resp.ok)
                return null;

            xml = await resp.text();
        }
        catch (e) {
            console.error(e);
        }

        if (!xml)
            return null;

        let instance = new RDFDoc();

        instance.uuid = node.uuid;
        instance.path = rdf_path;

        let doc = instance.doc = new DOMParser().parseFromString(xml, 'application/xml');

        instance._xmlNamespaces = new RDFNamespaces(doc);

        return instance;
    }

    addBookmarkNode(node, parent) {
        let xmlNode = this.doc.createElementNS(this._xmlNamespaces.NS_RDF, "Description");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_RDF, "about", `urn:scrapbook:item${node.external_id}`);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "id", node.external_id);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "type", "");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "title", node.name);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "chars", "");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "icon", "");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "source", node.uri);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "comment", "");
        this.doc.documentElement.appendChild(xmlNode)

        let query = `//RDF:Seq[@RDF:about='urn:scrapbook:item${parent.external_id}']`;
        if (!parent.external_id)
            query = `//RDF:Seq[@RDF:about='urn:scrapbook:root']`;

        let seqNode = this._selectFirst(query);

        let liNode = this.doc.createElementNS(this._xmlNamespaces.NS_RDF, "li");
        liNode.setAttributeNS(this._xmlNamespaces.NS_RDF, "resource", `urn:scrapbook:item${node.external_id}`);

        if (seqNode)
            seqNode.appendChild(liNode);

        return xmlNode
    }

    deleteBookmarkNode(node) {
        let query = node.type === NODE_TYPE_SEPARATOR
            ? `//NC:BookmarkSeparator[@RDF:about='urn:scrapbook:item${node.external_id}']`
            : `//RDF:Description[@RDF:about='urn:scrapbook:item${node.external_id}']`;
        let xmlNode = this._selectFirst(query);
        if (xmlNode)
            xmlNode.parentNode.removeChild(xmlNode);

        query = `//RDF:li[@RDF:resource='urn:scrapbook:item${node.external_id}']`;
        let liNode = this._selectFirst(query);
        if (liNode)
            liNode.parentNode.removeChild(liNode);

        if (node.type === NODE_TYPE_GROUP) {
            query = `//RDF:Seq[@RDF:about='urn:scrapbook:item${node.external_id}']`;
            let seqNode = this._selectFirst(query);
            if (seqNode)
                seqNode.parentNode.removeChild(seqNode);
        }
    }

    renameBookmark(node) {
        let query = `//RDF:Description[@RDF:about='urn:scrapbook:item${node.external_id}']`;
        let xmlNode = this._selectFirst(query);
        if (xmlNode)
            xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "title", node.name);
    }

    updateBookmark(node) {
        let query = `//RDF:Description[@RDF:about='urn:scrapbook:item${node.external_id}']`;
        let xmlNode = this._selectFirst(query);
        if (xmlNode)
            xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "title", node.name);
    }

    createBookmarkFolder(node, parent) {
        let xmlNode = this.addBookmarkNode(node, parent);

        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "type", "folder");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "source", "");

        let seqNode = this.doc.createElementNS(this._xmlNamespaces.NS_RDF, "Seq");
        seqNode.setAttributeNS(this._xmlNamespaces.NS_RDF, "about", `urn:scrapbook:item${node.external_id}`);
        this.doc.documentElement.appendChild(seqNode)
    }

    moveNodes(nodes, dest) {
        let query = `//RDF:Seq[@RDF:about='urn:scrapbook:item${dest.external_id}']`;
        let seqNode = this._selectFirst(query);
        if (seqNode) {
            for (let node of nodes) {
                let query = `//RDF:li[@RDF:resource='urn:scrapbook:item${node.external_id}']`;
                let liNode = this._selectFirst(query);
                if (liNode) {
                    liNode.parentNode.removeChild(liNode);
                    seqNode.appendChild(liNode);
                }
            }
        }
    }

    reorderNodes(nodes) {
        let query = `//RDF:li[@RDF:resource='urn:scrapbook:item${nodes[0].external_id}']`;
        let liNode = this._selectFirst(query);
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
                let pos = children.find(c => c.getAttributeNS(this._xmlNamespaces.NS_RDF, "resource").endsWith(node.external_id))
                if (pos)
                    seq.appendChild(pos);
            }
        }
    }
}

export class RDFBackend {
    constructor() {
    }

    async createBookmarkFolder(node, parent) {
        node.external = RDF_EXTERNAL_NAME;
        node.external_id = UUID.date();
        await Node.update(node);

        const rdfDoc = await RDFDoc.fromNode(node);
        if (rdfDoc) {
            rdfDoc.createBookmarkFolder(node, parent);
            await rdfDoc.write();
        }
    }

    async createBookmark(node, parent) {
        node.external = RDF_EXTERNAL_NAME;
        node.external_id = UUID.date();
        await Node.update(node);

        const rdfDoc = await RDFDoc.fromNode(node);
        if (rdfDoc) {
            rdfDoc.addBookmarkNode(node, parent);
            await rdfDoc.write();
        }
    }

    async renameBookmark(node) {
        const rdfDoc = await RDFDoc.fromNode(node);
        if (rdfDoc) {
            rdfDoc.renameBookmark(node)
            await rdfDoc.write();
        }
    }

    async moveBookmarks(dest, nodes) {
        let rdfNodes = nodes.filter(n => n.external === RDF_EXTERNAL_NAME);

        if (rdfNodes.length) {
            const rdfDoc = await RDFDoc.fromNode(dest);
            if (rdfDoc) {
                rdfDoc.moveNodes(nodes, dest);
                await rdfDoc.write();
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
                            await nativeBackend.post(`/rdf/delete_item/${node.uuid}`,
                                {rdf_directory: await this.getRDFPageDir(node)});
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }
                await rdf_doc.write();
            }
        }
    }

    async updateBookmark(node) {
        const rdfDoc = await RDFDoc.fromNode(node);
        if (rdfDoc) {
            rdfDoc.renameBookmark(node)
            await rdfDoc.write();
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

    async storeBookmarkData(node, data) {
        await Archive.delete(node.id);

        try {
            await nativeBackend.post(`/rdf/save_item/${node.uuid}`,
                {item_content: data,
                rdf_directory: await this.getRDFPageDir(node)});
        }
        catch (e) {
            console.error(e);
        }
    }

    async getRDFPageDir(node) {
        const path = await Path.compute(node);
        return `${path[0].uri}/data/${node.external_id}/`;
    }

    async pushRDFPath(node) {
        await nativeBackend.post(`/rdf/browse/push/${node.uuid}`,
            {rdf_directory: await this.getRDFPageDir(node)});
    }
}

export let rdfBackend = new RDFBackend();
