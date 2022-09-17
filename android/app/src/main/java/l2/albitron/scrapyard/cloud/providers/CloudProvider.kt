package l2.albitron.scrapyard.cloud.providers

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import l2.albitron.scrapyard.Settings
import java.io.InputStream

interface CloudProvider {
    suspend fun initialize(context: Context)
    fun downloadInputStream(path: String): InputStream?
    fun downloadBinaryFile(path: String): ByteArray?
    fun downloadTextFile(path: String): String?
    fun downloadRange(path: String, start: Long, length: Long): String?
    fun writeTextFile(path: String, content: String)
    fun deleteFile(path: String)

    companion object {
        suspend fun newCloudShelfProvider(context: Context): CloudProvider {
            val settings = Settings(context)
            return getProvider(context, settings.cloudShelfProvider)
        }

        suspend fun newSyncBookmarksProvider(context: Context): CloudProvider {
            val settings = Settings(context)
            return getProvider(context, settings.syncBookmarksProvider)
        }

        private suspend fun getProvider(context: Context, kind: String): CloudProvider {
            val provider = when (kind) {
                Settings.CLOUD_PROVIDER_ONEDRIVE -> OneDriveProvider()
                else -> DropboxProvider()
            }

            provider.initialize(context)

            return provider
        }

    }
}
