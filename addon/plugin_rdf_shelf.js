import UUID from "./uuid.js";
import {helperApp} from "./helper_app.js";
import {
    ARCHIVE_TYPE_FILES,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_FOLDER,
    NODE_TYPE_SEPARATOR,
    RDF_EXTERNAL_TYPE
} from "./storage.js";
import {Comments, Icon, Node} from "./storage_entities.js";
import {Path} from "./path.js";
import {RDFNamespaces} from "./utils_html.js";
import {CONTENT_TYPE_TO_EXT} from "./utils.js";
import {settings} from "./settings.js";

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
                await helperApp.post(`/rdf/xml/save/${this.uuid}`,
                    {rdf_content: content, rdf_file: this.path});
            }
        }
        catch (e) {
            console.error(e);
        }
    }

    static async fromNode(node) {
        const helper = await helperApp.hasVersion("0.5");
        if (!helper)
            return null;

        const rdf_path = `${(await Path.compute(node))[0].uri}/scrapbook.rdf`;

        let xml = null;

        try {
            const resp = await helperApp.post(`/rdf/xml/${node.uuid}`, {rdf_file: rdf_path});

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

    async addBookmarkNode(node, parent) {
        let xmlNode = this.doc.createElementNS(this._xmlNamespaces.NS_RDF, "Description");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_RDF, "about", `urn:scrapbook:item${node.external_id}`);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "id", node.external_id);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "type", "");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "title", node.name);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "chars", "UTF-8");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "icon", "");
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "source", node.uri);
        xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "comment", "");

        if (node.stored_icon) {
            const iconURL = await this.#loadNodeIcon(node);
            xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "icon", iconURL);
        }

        this.doc.documentElement.appendChild(xmlNode)

        let query = `//RDF:Seq[@RDF:about='urn:scrapbook:item${parent.external_id}']`;
        if (!parent.external_id)
            query = `//RDF:Seq[@RDF:about='urn:scrapbook:root']`;

        let seqNode = this._selectFirst(query);

        let liNode = this.doc.createElementNS(this._xmlNamespaces.NS_RDF, "li");
        liNode.setAttributeNS(this._xmlNamespaces.NS_RDF, "resource", `urn:scrapbook:item${node.external_id}`);

        if (seqNode)
            seqNode.appendChild(liNode);

        return xmlNode;
    }

    async #loadNodeIcon(node) {
        node.__icon_data_url = await Icon.get(node);
        const mimeType = node.__icon_data_url.match(/data:([^;]+)/)?.[1];
        node.__icon_ext = "ico";

        if (mimeType)
            node.__icon_ext = CONTENT_TYPE_TO_EXT[mimeType];

        return `resource://scrapbook/data/${node.external_id}/favicon.${node.__icon_ext}`;
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

        if (node.type === NODE_TYPE_FOLDER) {
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

    async updateBookmark(node) {
        let query = `//RDF:Description[@RDF:about='urn:scrapbook:item${node.external_id}']`;
        let xmlNode = this._selectFirst(query);
        if (xmlNode) {
            xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "title", node.name);
            xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "source", node.uri);

            if (node.has_comments) {
                let comments = await Comments.get(node);
                comments = comments.replace(/\n/g, " __BR__ ");
                xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "comment", comments);
            }
            else
                xmlNode.setAttributeNS(this._xmlNamespaces.NS_SCRAPBOOK, "comment", "");
        }
    }

    async createBookmarkFolder(node, parent) {
        let xmlNode = await this.addBookmarkNode(node, parent);

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

export class RDFShelfPlugin {
    constructor() {
    }

    async createBookmarkFolder(node, parent) {
        node.external = RDF_EXTERNAL_TYPE;
        node.external_id = UUID.date();
        await Node.update(node);

        const rdfDoc = await RDFDoc.fromNode(node);
        if (rdfDoc) {
            rdfDoc.createBookmarkFolder(node, parent);
            await rdfDoc.write();
        }
    }

    async createBookmark(node, parent) {
        node.external = RDF_EXTERNAL_TYPE;
        node.external_id = UUID.date();
        node.contains = ARCHIVE_TYPE_FILES;
        await Node.update(node);

        const rdfDoc = await RDFDoc.fromNode(node);
        if (rdfDoc) {
            await rdfDoc.addBookmarkNode(node, parent);
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
        let rdfNodes = nodes.filter(n => n.external === RDF_EXTERNAL_TYPE);

        if (rdfNodes.length) {
            const rdfDoc = await RDFDoc.fromNode(dest);
            if (rdfDoc) {
                rdfDoc.moveNodes(nodes, dest);
                await rdfDoc.write();
            }
        }
    }

    async deleteBookmarks(nodes) {
        if (nodes.some(n => n.external === RDF_EXTERNAL_TYPE && !n.external_id))
            return; // do not delete all from root

        let rdfNodes = nodes.filter(n => n.external === RDF_EXTERNAL_TYPE && n.external_id);

        if (rdfNodes.length) {
            const rdf_doc = await RDFDoc.fromNode(rdfNodes[0]);
            if (rdf_doc) {
                for (let node of rdfNodes) {
                    rdf_doc.deleteBookmarkNode(node);

                    if (node.type === NODE_TYPE_ARCHIVE) {
                        try {
                            await helperApp.post(`/rdf/delete_item/${node.uuid}`,
                                {rdf_archive_directory: await this.getRDFArchiveDir(node)});
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
            await rdfDoc.updateBookmark(node)
            await rdfDoc.write();
        }
    }

    async reorderBookmarks(nodes) {
        let rdfNodes = nodes.filter(n => n.external === RDF_EXTERNAL_TYPE && n.external_id);

        if (rdfNodes.length) {
            const rdfDoc = await RDFDoc.fromNode(nodes[0]);
            if (rdfDoc) {
                rdfDoc.reorderNodes(nodes);
                await rdfDoc.write();
            }
        }
    }

    async storeBookmarkData(node, data) {
        try {
            await helperApp.post(`/rdf/persist_archive`, {
                content: new Blob([data]),
                rdf_archive_path: await this.getRDFArchiveDir(node),
                scrapbook_id: node.external_id,
                title: node.name,
                source: node.uri,
                icon_ext: node.__icon_ext || "ico",
                icon_data: node.__icon_data_url?.split(",")?.[1] || null
            });
        }
        catch (e) {
            console.error(e);
        }
    }

    async getRDFArchiveDir(node) {
        const path = await Path.compute(node);
        return `${path[0].uri}/data/${node.external_id}/`;
    }
}

export let rdfShelf = new RDFShelfPlugin();
