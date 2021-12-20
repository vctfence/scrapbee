package l2.albitron.scrapyard.ui.sync_bookmarks


import l2.albitron.scrapyard.cloud.db.CloudDB
import l2.albitron.scrapyard.cloud.db.SyncStorageDB
import l2.albitron.scrapyard.ui.webview.BookmarkBrowserFragment

class SyncBookmarksFragment : BookmarkBrowserFragment() {
    override suspend fun getCloudDB(): CloudDB {
        val context = requireActivity()
        return CloudDB.newInstance(context, SyncStorageDB.DATABASE_TYPE)!!
    }
}