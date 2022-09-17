package l2.albitron.scrapyard.cloud.db

import android.content.Context
import l2.albitron.scrapyard.cloud.db.model.Node
import l2.albitron.scrapyard.cloud.providers.CloudProvider
import java.io.InputStream

interface CloudDB {
    val size: Int
    fun isEmpty(): Boolean
    fun download()
    fun persist()
    fun reset()

    fun downloadRaw(): String?
    fun downloadAsset(uuid: String, asset: String): String?
    fun downloadUnpackedIndex(uuid: String): String?
    fun downloadUnpackedAsset(uuid: String, assetPath: String): InputStream?

    fun downloadIcon(uuid: String): String?
    fun storeIcon(node: Node, dataURL: String)

    fun getOrCreateSharingFolder(name: String): Node
    fun addNode(node: Node, parent: Node): Node
    fun deleteNode(uuid: String?)

    fun storeNewBookmarkArchive(node: Node, text: String)
    fun storeArchiveIndex(node: Node, text: String)
    fun storeNewBookmarkNotes(node: Node, text: String)
    fun storeNotesIndex(node: Node, text: String)
    fun getArchiveBytes(uuid: String): ByteArray?

    fun getType(): String

    companion object {
        suspend fun newInstance(context: Context, type: String?): CloudDB? {
            val provider =
                when (type) {
                    CloudShelfDB.DATABASE_TYPE -> CloudProvider.newCloudShelfProvider(context)
                    SyncStorageDB.DATABASE_TYPE -> CloudProvider.newSyncBookmarksProvider(context)
                    else -> null
                }

            return when(type) {
                CloudShelfDB.DATABASE_TYPE -> CloudShelfDB(provider!!)
                SyncStorageDB.DATABASE_TYPE -> SyncStorageDB(provider!!)
                else -> null
            }
        }
    }
}
