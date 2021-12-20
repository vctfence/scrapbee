package l2.albitron.scrapyard.cloud.providers

import android.content.Context
import com.dropbox.core.DbxRequestConfig
import com.dropbox.core.android.Auth
import l2.albitron.scrapyard.BuildConfig

import com.dropbox.core.DbxException
import com.dropbox.core.NetworkIOException
import com.dropbox.core.oauth.DbxCredential
import com.dropbox.core.v2.DbxClientV2
import com.dropbox.core.v2.files.WriteMode
import l2.albitron.scrapyard.Settings
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudItemNotFoundException
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudNetworkException
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudNotAuthorizedException
import java.io.*
import java.lang.Exception
import java.nio.charset.StandardCharsets


class DropboxProvider : CloudProvider {
    private lateinit var _client: DbxClientV2

    override suspend fun initialize(context: Context) {
        val settings = Settings(context)
        val authToken = settings.dropboxAuthToken

        if (authToken?.isNotEmpty() == true) {
            val config = DbxRequestConfig("Scrapyard")
            val credential = DbxCredential.Reader.readFully(authToken)
            _client = DbxClientV2(config, credential)
        } else
            throw CloudNotAuthorizedException()
    }

    private fun copyStream(source: InputStream, target: OutputStream) {
        val buf = ByteArray(8192)
        var length: Int
        while (source.read(buf).also { length = it } > 0)
            target.write(buf, 0, length)
    }

    override fun downloadTextFile(path: String): String? {
        try {
            val downloader = _client.files().download(path)
            val fileSize = downloader.result.size.toInt()
            try {
                ByteArrayOutputStream(fileSize).use { out ->
                    copyStream(downloader.inputStream, out)
                    return String(out.toByteArray(), StandardCharsets.UTF_8)
                }
            } catch (e: IOException) {
                e.printStackTrace()
            } finally {
                downloader.close()
            }
        } catch (e: DbxException) {
            if (BuildConfig.DEBUG)
                e.printStackTrace()

            if (e is NetworkIOException)
                throw CloudNetworkException(e)

            throw CloudItemNotFoundException(e)
        }
        return null
    }

    override fun downloadRange(path: String, start: Long, length: Long): String? {
        try {
            val downloader = _client.files().downloadBuilder(path).range(start, length).start()
            try {
                ByteArrayOutputStream(length.toInt()).use { out ->
                    copyStream(downloader.inputStream, out)
                    return String(out.toByteArray(), StandardCharsets.UTF_8)
                }
            } catch (e: IOException) {
                e.printStackTrace()
            } finally {
                downloader.close()
            }
        } catch (e: DbxException) {
            if (BuildConfig.DEBUG)
                e.printStackTrace()
        }
        return null
    }

    override fun writeTextFile(path: String, content: String) {
        try {
            ByteArrayInputStream(content.toByteArray(StandardCharsets.UTF_8)).use { `in` ->
                _client.files().uploadBuilder(path)
                    .withMode(WriteMode.OVERWRITE)
                    .uploadAndFinish(`in`)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun deleteFile(path: String) {
        try {
            _client.files().deleteV2(path)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    companion object {
        fun startSignIn(context: Context): Boolean {
            val settings = Settings(context)

            return if (settings.dropboxAuthToken?.isNotEmpty() == true) {
                settings.clearDropboxAuthToken()
                false
            } else {
                val requestConfig = DbxRequestConfig("Scrapyard")
                Auth.startOAuth2PKCE(context, BuildConfig.DBX_API_KEY, requestConfig)
                true
            }
        }

        fun finishSignIn(context: Context): Boolean {
            val credential = Auth.getDbxCredential()

            return if (credential != null) {
                Settings(context).dropboxAuthToken = credential.toString();
                true
            } else
                false
        }

        fun isSignedIn(context: Context): Boolean =
            Settings(context).dropboxAuthToken?.isNotEmpty() == true
    }
}