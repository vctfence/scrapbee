package l2.albitron.scrapyard.cloud.db

import android.util.Base64
import com.fasterxml.jackson.core.JsonProcessingException
import l2.albitron.scrapyard.Scrapyard
import l2.albitron.scrapyard.cloud.db.model.*
import l2.albitron.scrapyard.cloud.providers.CloudProvider
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudItemNotFoundException
import java.io.IOException
import java.lang.Exception
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.*

private const val SYNC_STORAGE_PATH = "/Sync"
private const val SYNC_DB_INDEX = "scrapyard.jsonl"

class SyncStorageDB(provider: CloudProvider): AbstractCloudDB<Node>(), CloudDB {
    private var _provider: CloudProvider = provider
    private var _bookmarks: MutableList<Node> = ArrayList()
    private var _meta: SyncMeta? = null

    override fun getBookmarks(): MutableList<Node> {
        return _bookmarks
    }

    override fun setBookmarks(bookmarks: MutableList<Node>) {
        _bookmarks = bookmarks
    }

    override fun accessNode(bookmark: Node): Node {
        return bookmark
    }

    private fun createMeta(): SyncMeta {
        val meta = SyncMeta()
        meta.sync = Scrapyard.FORMAT_NAME
        meta.version = Scrapyard.SYNC_VERSION
        meta.entities = 0
        meta.timestamp = System.currentTimeMillis()
        meta.date = getISODate()
        return meta
    }

    private fun getISODate(): String {
        val df = SimpleDateFormat("yyyy-MM-dd'T'hh:mm:ss.SSS")
        return df.format(Calendar.getInstance().time)
    }

    private fun getCloudPath(file: String): String = "${SYNC_STORAGE_PATH}/$file"
    private fun getAssetPath(uuid: String): String = "objects/$uuid.jsonl"

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

            if (lines.size > 0)
                _meta = lines[0].fromJSON()

            if (lines.size > 1) {
                val nodeContainer = lines[1].fromJSON<SyncNodes>()
                if (nodeContainer.nodes != null)
                    _bookmarks = nodeContainer.nodes!!
            }
        } catch (e: IOException) {
            e.printStackTrace()
        }
    }

    private fun serialize(): String? {
        _meta?.entities = _bookmarks.size.toLong()
        _meta?.timestamp = System.currentTimeMillis()
        _meta?.date = getISODate()

        var result: String? = null
        try {
            val nodeContainer = SyncNodes()
            nodeContainer.nodes = _bookmarks
            result = """
                ${_meta?.toJSON()}
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
        val content = readCloudFile(SYNC_DB_INDEX)
        if (content != null)
            deserialize(content)
    }

    override fun persist() {
        val content = serialize()
        if (content != null)
            writeCloudFile(SYNC_DB_INDEX, content)
    }

    override fun reset() {
        _meta = createMeta()
        _bookmarks = ArrayList()
    }

    override fun downloadRaw(): String? = readCloudFile(SYNC_DB_INDEX)

    override fun downloadAssetRaw(uuid: String, asset: String): String? =
        readCloudFile(getAssetPath(uuid))

    override fun downloadIcon(uuid: String): String? {
        val path = getCloudPath(getAssetPath(uuid))
        var content = _provider.downloadRange(path, 0, 100 * 1024);
        var result: String? = extractIconURL(content)

        if (result == null) {
            content = _provider.downloadRange(path, 0, 1024 * 1024);
            result = extractIconURL(content)
        }

        return result
    }

    private fun extractIconURL(content: String?): String? {
        var result: String? = null
        if (content != null) {
            val lines = content.split("\n")
            if (lines.size > 1) {
                try {
                    val bookmarkContent: BookmarkContent = lines[1].fromJSON()
                    result = bookmarkContent.icon?.dataURL
                }
                catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }
        return result
    }

    override fun getOrCreateSharingFodler(name: String): Node {
        var groupNode = findGroup(name, Scrapyard.DEFAULT_SHELF_UUID)

        if (groupNode == null) {
            groupNode = newGroupNode(name, Scrapyard.DEFAULT_SHELF_UUID)
            _bookmarks.add(groupNode)
        }

        return groupNode
    }

    override fun addNode(node: Node, parent: Node): Node {
        initializeNode(node, parent)
        _bookmarks.add(node)

        return node
    }

    override fun storeNewBookmarkData(node: Node, text: String) {
        val archive = Archive()
        archive.`object` = text
        archive.type = "text/html"

        val content = BookmarkContent()
        content.archive = archive

        try {
            val output = """
                {"sync":"${Scrapyard.FORMAT_NAME}","version":${Scrapyard.SYNC_VERSION}}
                {}
                ${content.toJSON()}
                """.trimIndent()

            writeCloudFile(getAssetPath(node.uuid!!), output)
        } catch (e: JsonProcessingException) {
            e.printStackTrace()
        }
    }

    override fun storeNewBookmarkNotes(node: Node, text: String) {
        val notes = Notes()
        notes.content = text
        notes.format = "text"

        val content = BookmarkContent()
        content.notes = notes

        try {
            val output = """
                {"sync":"${Scrapyard.FORMAT_NAME}","version":${Scrapyard.SYNC_VERSION}}
                {}
                ${content.toJSON()}
                """.trimIndent()

            writeCloudFile(getAssetPath(node.uuid!!), output)
        } catch (e: JsonProcessingException) {
            e.printStackTrace()
        }
    }

    override fun getArchiveBytes(uuid: String): ByteArray? {
        val contentJSON = readCloudFile(getAssetPath(uuid))
        var result: ByteArray? = null
        try {
            if (contentJSON != null) {
                val lines = contentJSON.split("\n")
                if (lines.size > 2) {
                    val content = lines[2].fromJSON<BookmarkContent>()
                    if (content.archive != null) {
                        result =
                            if (content.archive?.byteLength != null) Base64.decode(
                                content.archive?.`object`,
                                Base64.DEFAULT
                            ) else content.archive?.`object`!!.toByteArray(
                                StandardCharsets.UTF_8
                            )
                    }
                }
            }
        } catch (e: IOException) {
            e.printStackTrace()
        }
        return result
    }

    override fun deleteBookmarkAssets(node: Node) {
        if (node.type != Scrapyard.NODE_TYPE_SHELF && node.type != Scrapyard.NODE_TYPE_GROUP)
            deleteCloudFile(getAssetPath(node.uuid!!))
    }

    override fun getType(): String {
        return DATABASE_TYPE
    }

    companion object {
        const val DATABASE_TYPE = "sync"
    }
}