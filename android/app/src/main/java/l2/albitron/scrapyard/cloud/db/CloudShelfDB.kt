package l2.albitron.scrapyard.cloud.db

import android.util.Base64
import com.fasterxml.jackson.core.JsonProcessingException
import l2.albitron.scrapyard.Scrapyard
import l2.albitron.scrapyard.cloud.db.model.*
import l2.albitron.scrapyard.cloud.providers.CloudProvider
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudItemNotFoundException
import org.apache.commons.text.StringEscapeUtils
import java.io.IOException
import java.lang.Exception
import java.nio.charset.StandardCharsets
import java.util.ArrayList

private const val CLOUD_SHELF_PATH = "/Cloud"
private const val CLOUD_DB_INDEX = "index.jsonl"

class CloudShelfDB(provider: CloudProvider): AbstractCloudDB<BookmarkContent>(), CloudDB {
    private var _provider: CloudProvider = provider
    private var _bookmarks: MutableList<BookmarkContent> = ArrayList()
    private var _meta: CloudShelfMeta

    init {
        _meta = createMeta()
    }

    override fun getBookmarks(): MutableList<BookmarkContent> {
        return _bookmarks
    }

    override fun setBookmarks(bookmarks: MutableList<BookmarkContent>) {
        _bookmarks = bookmarks
    }

    override fun accessNode(bookmark: BookmarkContent): Node {
        return bookmark.node!!
    }

    private fun createMeta(): CloudShelfMeta {
        val meta = CloudShelfMeta()
        meta.cloud = Scrapyard.FORMAT_NAME
        meta.version = Scrapyard.CLOUD_VERSION
        meta.timestamp = System.currentTimeMillis()
        return meta
    }

    private fun getCloudPath(file: String): String = "${CLOUD_SHELF_PATH}/$file"

    private fun readCloudFile(file: String): String? {
        return try {
            _provider.downloadTextFile(getCloudPath(file))
        } catch (e: CloudItemNotFoundException) {
            null
        }
    }

    private fun writeCloudFile(file: String, content: String) {
        _provider.writeTextFile(getCloudPath(file), content)
    }

    private fun deleteCloudFile(file: String) {
        try {
            _provider.deleteFile(getCloudPath(file))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun deserialize(content: String) {
        try {
            val lines = content.split("\n".toRegex()).toTypedArray()

            if (lines.isNotEmpty())
                _meta = lines[0].fromJSON()

            if (lines.size > 1) {
                val nodeContainer = lines[1].fromJSON<CloudShelfNodes>()
                if (nodeContainer.nodes != null)
                    _bookmarks = nodeContainer.nodes!!
            }
        } catch (e: IOException) {
            e.printStackTrace()
        }
    }

    private fun serialize(): String? {
        _meta.timestamp = System.currentTimeMillis()
        var result: String? = null
        try {
            val nodeContainer = CloudShelfNodes()
            nodeContainer.nodes = _bookmarks
            result = """
                ${_meta.toJSON()}
                ${nodeContainer.toJSON()}
                """.trimIndent()
        } catch (e: JsonProcessingException) {
            e.printStackTrace()
        }
        return result
    }

    override fun isEmpty(): Boolean {
        return _bookmarks.size == 0
    }

    override fun download() {
        val content = readCloudFile(CLOUD_DB_INDEX)
        if (content != null)
            deserialize(content)
    }

    override fun persist() {
        val content = serialize()
        if (content != null)
            writeCloudFile(CLOUD_DB_INDEX, content)
    }

    override fun reset() {
        _meta = createMeta()
        _bookmarks = ArrayList()
    }

    override fun downloadRaw(): String? = readCloudFile(CLOUD_DB_INDEX)

    override fun downloadAssetRaw(uuid: String, asset: String): String? = readCloudFile("$uuid.$asset")

    override fun downloadIcon(uuid: String): String? = null

    override fun getOrCreateSharingFodler(name: String): Node {
        var group = findGroup(name, Scrapyard.CLOUD_SHELF_UUID)

        val groupNode: Node
        if (group == null) {
            groupNode = newGroupNode(name, Scrapyard.CLOUD_SHELF_UUID)
            groupNode.external = Scrapyard.CLOUD_EXTERNAL_NAME
            groupNode.externalId = groupNode.uuid

            group = BookmarkContent()
            group.node = groupNode
            _bookmarks.add(group)
        }
        else
            groupNode = group.node!!

        return groupNode
    }

    override fun addNode(node: Node, parent: Node): Node {
        initializeNode(node, parent)
        node.external = Scrapyard.CLOUD_EXTERNAL_NAME
        node.externalId = node.uuid

        val bookmark = BookmarkContent()
        bookmark.node = node
        _bookmarks.add(bookmark)

        return node
    }

    override fun storeNewBookmarkData(node: Node, text: String) {
        val archive = Archive()
        archive.`object` = text
        archive.type = "text/html"

        var json = ""
        try {
            json = archive.toJSON()
        } catch (e: JsonProcessingException) {
            e.printStackTrace()
        }
        writeCloudFile(node.uuid + ".data", json)
    }

    override fun storeNewBookmarkNotes(node: Node, text: String) {
        val notes = Notes()
        notes.content = text
        notes.format = "text"

        var json = ""
        try {
            json = notes.toJSON()
        } catch (e: JsonProcessingException) {
            e.printStackTrace()
        }
        writeCloudFile(node.uuid + ".notes", json)

        val htmlContent = StringEscapeUtils.escapeHtml4(text)
        val html = ("<html><head></head><pre class='plaintext'>$htmlContent</pre></body>")
        writeCloudFile(node.uuid + ".view", html)
    }

    override fun deleteBookmarkAssets(node: Node) {
        if (node.type == Scrapyard.NODE_TYPE_ARCHIVE)
            deleteCloudFile(node.uuid + ".data")

        if (node.hasNotes != null && node.hasNotes!!) {
            deleteCloudFile(node.uuid + ".notes")
            deleteCloudFile(node.uuid + ".view")
        }

        if (node.hasComments != null && node.hasComments!!)
            deleteCloudFile(node.uuid + ".comments")
    }

    override fun getArchiveBytes(uuid: String): ByteArray? {
        val archiveJSON = readCloudFile("$uuid.data")
        var result: ByteArray? = null
        try {
            val archive = archiveJSON?.fromJSON<Archive>()
            if (archive != null) {
                result =
                    if (archive.byteLength != null) Base64.decode(
                        archive.`object`,
                        Base64.DEFAULT
                    ) else archive.`object`!!.toByteArray(
                        StandardCharsets.UTF_8
                    )
            }
        } catch (e: IOException) {
            e.printStackTrace()
        }
        return result
    }

    override fun getType(): String {
        return DATABASE_TYPE
    }

    companion object {
        const val DATABASE_TYPE = "cloud"
    }
}