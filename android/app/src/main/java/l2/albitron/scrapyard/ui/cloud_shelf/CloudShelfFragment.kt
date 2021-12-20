package l2.albitron.scrapyard.ui.cloud_shelf

import l2.albitron.scrapyard.cloud.db.CloudDB
import l2.albitron.scrapyard.cloud.db.CloudShelfDB
import l2.albitron.scrapyard.ui.webview.BookmarkBrowserFragment

class CloudShelfFragment : BookmarkBrowserFragment() {
    override suspend fun getCloudDB(): CloudDB {
        val context = requireActivity()
        return CloudDB.newInstance(context, CloudShelfDB.DATABASE_TYPE)!!
    }
}