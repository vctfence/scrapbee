package l2.albitron.scrapyard.cloud.providers

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import com.microsoft.graph.authentication.BaseAuthenticationProvider
import com.microsoft.graph.http.GraphServiceException
import com.microsoft.graph.models.DriveItem
import com.microsoft.graph.models.DriveItemCreateUploadSessionParameterSet
import com.microsoft.graph.models.DriveItemUploadableProperties
import com.microsoft.graph.requests.DriveItemRequestBuilder
import com.microsoft.graph.requests.GraphServiceClient
import com.microsoft.graph.tasks.LargeFileUploadTask
import com.microsoft.identity.client.AuthenticationCallback
import com.microsoft.identity.client.IAuthenticationResult
import com.microsoft.identity.client.IPublicClientApplication.ISingleAccountApplicationCreatedListener
import com.microsoft.identity.client.ISingleAccountPublicClientApplication
import com.microsoft.identity.client.PublicClientApplication
import com.microsoft.identity.client.exception.MsalClientException
import com.microsoft.identity.client.exception.MsalException
import com.microsoft.identity.client.exception.MsalUiRequiredException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import l2.albitron.scrapyard.R
import l2.albitron.scrapyard.Settings
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudItemNotFoundException
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudNotAuthorizedException
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.CompletableFuture
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.coroutines.suspendCoroutine


private val ONEDRIVE_PERMISSIONS = arrayOf("User.Read", "Files.ReadWrite", "Files.ReadWrite.AppFolder")

class OneDriveProvider : CloudProvider {
    private lateinit var _application: ISingleAccountPublicClientApplication
    private lateinit var _graphClient: GraphServiceClient<Request>

    override suspend fun initialize(context: Context) {
        val settings = Settings(context)

        if (!settings.isOneDriveSignedIn)
            throw CloudNotAuthorizedException()

        _application = createClientApplication(context)

        val authProvider = AuthenticationProvider(settings)
        _graphClient = GraphServiceClient.builder().authenticationProvider(authProvider).buildClient()
    }

    private fun copyStream(source: InputStream, target: OutputStream) {
        val buf = ByteArray(8192)
        var length: Int
        while (source.read(buf).also { length = it } > 0)
            target.write(buf, 0, length)
    }

    private suspend fun acquireTokenSilently(): IAuthenticationResult? {
        val authority: String = _application.configuration.defaultAuthority.authorityURL.toString()

        return suspendCoroutine { continuation ->
            _application.acquireTokenSilentAsync(ONEDRIVE_PERMISSIONS, authority, object : AuthenticationCallback {
                override fun onSuccess(authenticationResult: IAuthenticationResult) {
                    continuation.resume(authenticationResult)
                }
                override fun onError(exception: MsalException) {
                    continuation.resumeWithException(exception)
                }
                override fun onCancel() {
                    continuation.resume(null)
                }
            })
        }
    }

    private fun normalizePath(path: String): String {
        return if (path.startsWith("/"))
            path.substring(1)
        else
            path
    }

    private fun itemWithPath(path: String): DriveItemRequestBuilder {
        val normalizedPath = normalizePath(path)

        return _graphClient
            .me()
            .drive()
            .special()
            .appRoot()
            .itemWithPath(normalizedPath)
    }


    // GraphServiceException: Error code: itemNotFound
    override fun downloadTextFile(path: String): String? {
        var driveItem: DriveItem? = null
        var inputStream: InputStream? = null

        try {
            driveItem = itemWithPath(path).buildRequest().get()
            inputStream = itemWithPath(path).content().buildRequest().get()
        }
        catch(e: GraphServiceException) {
            if (e.serviceError?.code == "itemNotFound")
                throw CloudItemNotFoundException(e)

            e.printStackTrace()
        }

        return if (driveItem != null && inputStream != null)
            ByteArrayOutputStream(driveItem.size?.toInt()!!).use { out ->
                copyStream(inputStream, out)
                String(out.toByteArray(), StandardCharsets.UTF_8)
            }
        else
            null
    }

    override fun downloadRange(path: String, start: Long, length: Long): String? {
        val driveItem = itemWithPath(path).buildRequest().get()
        val downloadURL = driveItem?.additionalDataManager()?.getValue("@microsoft.graph.downloadUrl")?.asString
        var result: String? = null

        if (downloadURL != null) {
            val request = Request.Builder()
                .url(downloadURL)
                .header("Range", "bytes=$start-${start + length - 1}")
                .build()

            val client = OkHttpClient();
            client.newCall(request).execute().use {
                val bytes = it.body?.bytes()
                if (bytes != null)
                    result = String(bytes, StandardCharsets.UTF_8)
            }
        }

        return result
    }

    override fun writeTextFile(path: String, content: String) {
        val bytes = content.toByteArray(StandardCharsets.UTF_8)

        if (bytes.size > 4 * 1024 * 1024)
            uploadLargeFile(path, bytes)
        else
            uploadSmallFile(path, bytes)
    }

    private fun uploadSmallFile(path: String, bytes: ByteArray) {
        itemWithPath(path).content().buildRequest().put(bytes)
    }

    private fun uploadLargeFile(path: String, bytes: ByteArray) {
        val uploadParams = DriveItemCreateUploadSessionParameterSet.newBuilder()
            .withItem(DriveItemUploadableProperties()).build()

        val uploadSession = itemWithPath(path)
            .createUploadSession(uploadParams)
            .buildRequest()
            .post()

        val inputStream = ByteArrayInputStream(bytes)

        if (uploadSession != null) {
            val largeFileUploadTask = LargeFileUploadTask(
                uploadSession, _graphClient, inputStream, bytes.size.toLong(),
                DriveItem::class.java
            )

            largeFileUploadTask.upload(0, null)
        }
    }

    override fun deleteFile(path: String) {
        itemWithPath(path).buildRequest().delete()
    }

    private inner class AuthenticationProvider(settings: Settings) : BaseAuthenticationProvider() {
        private val _settings = settings

        @SuppressLint("NewApi")
        override fun getAuthorizationTokenAsync(requestUrl: URL): CompletableFuture<String> {
            return if (shouldAuthenticateRequestWithUrl(requestUrl)) {
                val future = CompletableFuture<String>()

                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        val authResult: IAuthenticationResult? = acquireTokenSilently()
                        future.complete(authResult?.accessToken)
                    }
                    catch (e: MsalUiRequiredException) {
                        _settings.isOneDriveSignedIn = false
                        future.completeExceptionally(CloudNotAuthorizedException())
                    }
                    catch (e: MsalClientException) {
                        if (e.getErrorCode() == "no_current_account" || e.getErrorCode() == "no_account_found") {
                            _settings.isOneDriveSignedIn = false
                            future.completeExceptionally(CloudNotAuthorizedException())
                        }
                        else
                            future.completeExceptionally(e)
                    }
                    catch (e: Exception) {
                        future.completeExceptionally(e)
                    }
                }
                future
            } else
                CompletableFuture.completedFuture(null)
        }
    }

    companion object {
        suspend fun createClientApplication(context: Context): ISingleAccountPublicClientApplication {
            return suspendCoroutine { continuation ->
                PublicClientApplication.createSingleAccountPublicClientApplication(context, R.raw.msal_auth_config,
                    object : ISingleAccountApplicationCreatedListener {
                        override fun onCreated(application: ISingleAccountPublicClientApplication) {
                            continuation.resume(application)
                        }
                        override fun onError(exception: MsalException) {
                            continuation.resumeWithException(exception)
                        }
                    })
            }
        }

        suspend fun signIn(context: Activity) {
            val application = createClientApplication(context)

            return suspendCoroutine { continuation ->
                application.signIn(context, "", ONEDRIVE_PERMISSIONS,
                    object : AuthenticationCallback {
                        override fun onSuccess(authenticationResult: IAuthenticationResult) {
                            continuation.resume(Unit)
                        }
                        override fun onError(exception: MsalException) {
                            continuation.resumeWithException(exception)
                        }
                        override fun onCancel() {
                            continuation.resume(Unit)
                        }
                    })
            }
        }


        suspend fun signOut(context: Activity) {
            val application = createClientApplication(context)

            return suspendCoroutine { continuation ->
                application.signOut(object : ISingleAccountPublicClientApplication.SignOutCallback {
                    override fun onSignOut() {
                        continuation.resume(Unit)
                    }

                    override fun onError(exception: MsalException) {
                        continuation.resumeWithException(exception)
                    }
                })
            }
        }

//        fun getSignature(context: Context) {
//            val packageName: String = context.getPackageName()
//            try {
//                val info: PackageInfo = context.getPackageManager().getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
//                for (signature in info.signatures) {
//                    var md: MessageDigest
//                    md = MessageDigest.getInstance("SHA")
//                    md.update(signature.toByteArray())
//                    val sha1Singature = String(Base64.encode(md.digest(), 0))
//                    //String something = new String(Base64.encodeBytes(md.digest()));
//                    Log.e("uuu", sha1Singature)
//                }
//            } catch (e1: PackageManager.NameNotFoundException) {
//                Log.e("name not found", e1.toString())
//            } catch (e: NoSuchAlgorithmException) {
//                Log.e("no such an algorithm", e.toString())
//            } catch (e: Exception) {
//                Log.e("exception", e.toString())
//            }
//        }
    }
}