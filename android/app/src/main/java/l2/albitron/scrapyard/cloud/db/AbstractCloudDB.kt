package l2.albitron.scrapyard.cloud.db

import com.fasterxml.jackson.core.JsonProcessingException
import l2.albitron.scrapyard.Scrapyard
import l2.albitron.scrapyard.cloud.db.model.*
import l2.albitron.scrapyard.cloud.providers.CloudProvider
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudItemNotFoundException
import l2.albitron.scrapyard.isContentNode
import java.io.IOException
import java.io.InputStream
import java.lang.Exception
import java.text.SimpleDateFormat
import java.util.*

abstract class AbstractCloudDB {
    protected val OBJECTS_DIRECTORY = "objects"
    protected val ARCHIVE_DIRECTORY = "archive"
    protected val ICON_OBJECT_FILE = "icon.json"
    protected val NOTES_OBJECT_FILE = "notes.json"
    protected val NOTES_INDEX_FILE = "notes_index.json"
    protected val ARCHIVE_CONTENT_FILE = "archive_content.blob"
    protected val ARCHIVE_INDEX_FILE = "archive_index.json"

    protected var _bookmarks: MutableList<Node> = ArrayList()
    protected abstract var _provider: CloudProvider
    protected abstract var _meta: JSONScrapbookMeta

    protected abstract fun createTypeMeta(): JSONScrapbookMeta
    protected abstract fun getDatabaseFile(): String
    protected abstract fun getCloudPath(file: String): String
    protected abstract fun getSharingShelfUUID(): String

    val size: Int
        get() = _bookmarks.size

    protected fun createMeta(type: String?, contains: String?): JSONScrapbookMeta {
        val meta = JSONScrapbookMeta()

        meta.format = Scrapyard.FORMAT_NAME
        meta.version = Scrapyard.FORMAT_VERSION
        meta.type = type
        meta.contains = contains
        meta.uuid = Scrapyard.genUUID()
        meta.entities = 0
        meta.timestamp = System.currentTimeMillis()
        meta.date = getISOTimestamp()

        return meta
    }

    protected fun getObjectDirectory(uuid: String): String = "$OBJECTS_DIRECTORY/$uuid"
    protected fun getObjectPath(uuid: String, asset: String): String = "$OBJECTS_DIRECTORY/$uuid/$asset"

    protected fun getISOTimestamp(): String {
        val df = SimpleDateFormat("yyyy-MM-dd'T'hh:mm:ss.SSS")
        return df.format(Calendar.getInstance().time)
    }

    fun getBookmarks(): MutableList<Node> {
        return _bookmarks
    }

    fun setBookmarks(bookmarks: MutableList<Node>) {
        _bookmarks = bookmarks
    }

    protected fun findFolder(name: String, parentUUID: String): Node? {
        val folderFilter = { b: Node -> b.type != null
                && b.type == Scrapyard.NODE_TYPE_FOLDER
                && parentUUID == b.parent
                && name.equals(b.title, ignoreCase = true)
        }
        return getBookmarks().firstOrNull(folderFilter)
    }

    protected fun newFolderNode(name: String, parentUUID: String): Node {
        val folderNode = Node()
        folderNode.title = name
        folderNode.parent = parentUUID
        folderNode.uuid = Scrapyard.genUUID()
        folderNode.type = Scrapyard.NODE_TYPE_FOLDER
        folderNode.dateAdded = System.currentTimeMillis()
        folderNode.dateModified = folderNode.dateAdded

        return folderNode
    }

    protected fun initializeNode(node: Node, parent: Node): Node {
        node.uuid = Scrapyard.genUUID()
        node.dateAdded = System.currentTimeMillis()
        node.dateModified = node.dateAdded
        node.parent = parent.uuid

        if (node.type == Scrapyard.NODE_TYPE_ARCHIVE || node.type == Scrapyard.NODE_TYPE_NOTES)
            node.contentModified = node.dateModified

        return node
    }

    fun deleteNode(uuid: String?) {
        if (uuid != Scrapyard.DEFAULT_SHELF_UUID) {

            val bookmarks = getBookmarks()
            val subtree = queryFullSubtree(uuid, bookmarks)
            val subtreeUUIDs: Set<String?> = subtree.map { n -> n?.uuid }.toSet()
            val subtreeFilter = { b: Node -> subtreeUUIDs.contains(b.uuid) }
            val nonSubtreeFilter = { b: Node -> !subtreeUUIDs.contains(b.uuid) }
            val subtreeBookmarks = bookmarks.filter(subtreeFilter)

            setBookmarks(bookmarks.filter(nonSubtreeFilter).toMutableList())
            for (bookmark in subtreeBookmarks)
                if (isContentNode(bookmark))
                    deleteBookmarkAssets(bookmark)
        }
    }

    private fun deleteBookmarkAssets(node: Node) {
        val objectDirectory = getObjectDirectory(node.uuid!!)
        deleteCloudFile(objectDirectory)
    }

    private fun queryFullSubtree(uuid: String?, bookmarks: MutableList<Node>): List<Node?> {
        val root = bookmarks.firstOrNull { uuid?.equals( it.uuid, ignoreCase = true) == true }
        val result: MutableList<Node> = ArrayList()
        if (root != null) {
            val node = root
            result.add(node)
            if (node.type == Scrapyard.NODE_TYPE_SHELF || node.type == Scrapyard.NODE_TYPE_FOLDER)
                getChildren(root, bookmarks, result)
        }
        return result
    }

    private fun getChildren(node: Node, bookmarks: MutableList<Node>, outNodes: MutableList<Node>) {
        val children = bookmarks.filter { node.uuid.equals(it.parent, ignoreCase = true) }
        for (bookmark in children) {
            val childNode = bookmark
            outNodes.add(childNode)
            if (childNode.type == Scrapyard.NODE_TYPE_SHELF || childNode.type == Scrapyard.NODE_TYPE_FOLDER)
                getChildren(childNode, bookmarks, outNodes)
        }
    }

    private fun readCloudBinaryFile(file: String): ByteArray? {
        val path = getCloudPath(file)

        return try {
            _provider.downloadBinaryFile(path)
        } catch (e: CloudItemNotFoundException) {
            null
        }
    }

    private fun readCloudFile(file: String): String? {
        val path = getCloudPath(file)

        return try {
            _provider.downloadTextFile(path)
        } catch (e: CloudItemNotFoundException) {
            null
        }
    }

    private fun writeCloudFile(file: String, content: String) {
        val path = getCloudPath(file)
        _provider.writeTextFile(path, content)
    }

    private fun deleteCloudFile(file: String) {
        try {
            val path = getCloudPath(file)
            _provider.deleteFile(path)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun deserialize(content: String) {
        try {
            val lines = content.split("\n".toRegex())

            if (lines.isNotEmpty())
                _meta = lines[0].fromJSON()

            if (lines.size > 1) {
                for (line in lines.subList(1, lines.size)) {
                    val node = line.fromJSON<Node>()

                    _bookmarks.add(node)
                }
            }
        } catch (e: IOException) {
            e.printStackTrace()
        }
    }

    private fun serialize(): String? {
        _meta.timestamp = System.currentTimeMillis()
        _meta.date = getISOTimestamp()
        _meta.entities = _bookmarks.size.toLong()

        var result: String? = null
        try {
            val lines = ArrayList<String>(_bookmarks.size + 1)

            lines.add(_meta.toJSON())

            for (node in _bookmarks)
                lines.add(node.toJSON())

            result = lines.joinToString("\n")
        } catch (e: JsonProcessingException) {
            e.printStackTrace()
        }

        return result
    }

    fun isEmpty(): Boolean {
        return _bookmarks.size == 0
    }

    fun download() {
        val dbFile = getDatabaseFile()
        val content = readCloudFile(dbFile)

        if (content != null)
            deserialize(content)
    }

    fun persist() {
        val dbFile = getDatabaseFile()
        val content = serialize()

        if (content != null)
            writeCloudFile(dbFile, content)
    }

    fun reset() {
        _meta = createTypeMeta()
        _bookmarks = ArrayList()
    }

    fun downloadRaw(): String? {
        val dbFile = getDatabaseFile()
        return readCloudFile(dbFile)
    }

    fun downloadAsset(uuid: String, asset: String): String? {
        val objectPath = getObjectPath(uuid, asset)
        return readCloudFile(objectPath)
    }

    fun downloadUnpackedIndex(uuid: String): String? {
        val objectPath = getObjectPath(uuid, "$ARCHIVE_DIRECTORY/index.html")
        return readCloudFile(objectPath)
    }

    fun downloadUnpackedAsset(uuid: String, assetPath: String): InputStream? {
        val objectPath = getObjectPath(uuid, "$ARCHIVE_DIRECTORY/$assetPath")
        val cloudPath = getCloudPath(objectPath)

        try {
            return _provider.downloadInputStream(cloudPath)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return null
    }

    fun downloadIcon(uuid: String): String? {
        val path = getObjectPath(uuid, ICON_OBJECT_FILE)
        val content = readCloudFile(path)

        return extractIconURL(content)
    }

    private fun extractIconURL(content: String?): String? {
        var result: String? = null

        if (content != null) {
            try {
                val icon: Icon = content.fromJSON()
                result = icon.dataURL
            }
            catch (e: Exception) {
                e.printStackTrace()
            }
        }

        return result
    }

    fun storeIcon(node: Node, dataURL: String) {
        val objectPath = getObjectPath(node.uuid!!, ICON_OBJECT_FILE)
        val icon = Icon()

        icon.dataURL = dataURL

        val json = icon.toJSON()

        writeCloudFile(objectPath, json)
    }

    fun getOrCreateSharingFolder(name: String): Node {
        val sharingShelfUUID = getSharingShelfUUID()
        var folder = findFolder(name, sharingShelfUUID)

        if (folder == null) {
            folder = newFolderNode(name, sharingShelfUUID)
            _bookmarks.add(folder)
        }

        return folder
    }

    fun addNode(node: Node, parent: Node): Node {
        initializeNode(node, parent)
        _bookmarks.add(node)

        return node
    }

    fun storeNewBookmarkArchive(node: Node, text: String) {
        val objectPath = getObjectPath(node.uuid!!, ARCHIVE_CONTENT_FILE)
        writeCloudFile(objectPath, text)
    }

    fun storeArchiveIndex(node: Node, text: String) {
        val objectPath = getObjectPath(node.uuid!!, ARCHIVE_INDEX_FILE)
        writeCloudFile(objectPath, text)
    }

    fun storeNewBookmarkNotes(node: Node, text: String) {
        val notes = Notes()
        notes.content = text
        notes.format = Scrapyard.NOTES_FORMAT_TEXT

        var json = ""
        try {
            json = notes.toJSON()
        } catch (e: JsonProcessingException) {
            e.printStackTrace()
        }

        val objectPath = getObjectPath(node.uuid!!, NOTES_OBJECT_FILE)
        writeCloudFile(objectPath, json)
    }

    fun storeNotesIndex(node: Node, text: String) {
        val objectPath = getObjectPath(node.uuid!!, NOTES_INDEX_FILE)
        writeCloudFile(objectPath, text)
    }

    fun getArchiveBytes(uuid: String): ByteArray? {
        val objectPath = getObjectPath(uuid, ARCHIVE_CONTENT_FILE)
        return readCloudBinaryFile(objectPath)
    }
}
