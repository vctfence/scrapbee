package l2.albitron.scrapyard.cloud.db

import android.content.Context
import l2.albitron.scrapyard.cloud.db.model.Node
import l2.albitron.scrapyard.cloud.providers.CloudProvider

interface CloudDB {
    fun isEmpty(): Boolean
    fun download()
    fun persist()
    fun reset()

    fun downloadRaw(): String?
    fun downloadAssetRaw(uuid: String, asset: String): String?
    fun downloadIcon(uuid: String): String?

    fun getOrCreateSharingFodler(name: String): Node
    fun addNode(node: Node, parent: Node): Node
    fun deleteNode(uuid: String?)

    fun storeNewBookmarkData(node: Node, text: String)
    fun storeNewBookmarkNotes(node: Node, text: String)
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