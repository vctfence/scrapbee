package l2.albitron.scrapyard.ui.webview

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import androidx.navigation.findNavController
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import l2.albitron.scrapyard.*
import l2.albitron.scrapyard.cloud.bookmarks.StorageService
import l2.albitron.scrapyard.cloud.db.CloudDB
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudNotAuthorizedException
import org.apache.commons.text.StringEscapeUtils


abstract class BookmarkBrowserFragment : Fragment() {
    private lateinit var _cloudDB: CloudDB
    private lateinit var _browser: WebView

    protected abstract suspend fun getCloudDB(): CloudDB

   override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        val rootView: View = inflater.inflate(R.layout.fragment_bookmark_browser, container, false)

       _browser = initWebView(rootView)

       return rootView
    }

    override fun onDestroy() {
        super.onDestroy()
    }

    private fun initWebView(rootView: View): WebView {
        val browser = rootView.findViewById<View>(R.id.browser_web_view) as WebView
        // API level 21 uses Chrome 37
        //println(browser.settings.userAgentString)

        //WebView.setWebContentsDebuggingEnabled(true)

        with(browser) {
            addJavascriptInterface(WebAppInterface(), "Android")
            webViewClient = BrowserWebViewClient()
            webChromeClient = BrowserChromeClient()

            settings.databaseEnabled = true
            settings.domStorageEnabled = true
            settings.javaScriptEnabled = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

            val appSettings = Settings(this@BookmarkBrowserFragment.requireContext())
            var hash = "#"

            if (appSettings.rememberTreeState)
                hash += "rememberTreeState"

            loadUrl("file:///android_asset/treeview.html$hash" )
        }

        return browser
    }

    private suspend fun initDatabase(): Boolean {
        try {
            _cloudDB = getCloudDB()
        } catch (e: CloudNotAuthorizedException) {
            withContext(Dispatchers.Main) { askForProviderAuthorization() }
            return false
        }

        return true
    }

    fun showLoadingAnimation() {
        _browser.evaluateJavascript("hideFillers(); showLoadingAnimation()", null)
    }

    fun hideLoadingAnimation() {
        _browser.evaluateJavascript("hideLoadingAnimation()", null)
    }

    private fun handleNoConnection() {
        _browser.evaluateJavascript("handleNoConnection()", null)
    }

    suspend fun loadBookmarks() {
        if (isOnline(requireContext())) {
            withContext(Dispatchers.Main) { showLoadingAnimation() }

            var json: String? = null
            try {
                json = _cloudDB.downloadRaw()
            } catch (e: Exception) {
                e.printStackTrace()
            }

            withContext(Dispatchers.Main) { injectBookmarks(json) }
        }
        else
            withContext(Dispatchers.Main) { handleNoConnection() }
    }

    private fun askForProviderAuthorization() {
        val context = requireActivity()
        showToast(R.string.configure_cloud_provider, Toast.LENGTH_LONG)
        redirectToProvidersFragment(context)
    }

    private fun injectBookmarks(json: String?) {
        if (json != null) {
            val script = "injectCloudBookmarks(\"" + StringEscapeUtils.escapeJson(json) + "\")"
            _browser.evaluateJavascript(script, null)
        }
        else {
            val script = "handleEmptyContent(\"" + _cloudDB.getType() + "\")"
            _browser.evaluateJavascript(script, null)
        }
    }

    private inner class BrowserWebViewClient : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String) {
            CoroutineScope(Dispatchers.IO).launch {
                if (initDatabase())
                    loadBookmarks()
            }
        }

        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
            return if (url.startsWith("http://") || url.startsWith("https://")) {
                view.context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                true
            } else
                false
        }
    }

    private inner class BrowserChromeClient : WebChromeClient() {
        override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
            AlertDialog.Builder(view.context)
                .setTitle(R.string.warning)
                .setMessage(message)
                .setPositiveButton(R.string.ok) { _, _ -> result.confirm() }
                .setNegativeButton(R.string.cancel) { _, _ -> result.cancel() }
                .create()
                .show()
            return true
        }
    }

    private inner class WebAppInterface() {
        @JavascriptInterface
        fun openArchive(uuid: String?, asset: String?) {
            executeInUIThread {
                val navController = requireActivity().findNavController(R.id.nav_host_fragment_content_main)
                val args = bundleOf(
                    ContentBrowserFragment.ARG_UUID to uuid,
                    ContentBrowserFragment.ARG_ASSET to asset,
                    ContentBrowserFragment.ARG_DB_TYPE to _cloudDB.getType()
                )
                navController.navigate(R.id.nav_content_browser, args)
            }
        }

        @JavascriptInterface
        fun refreshTree() {
            _browser.post {
                CoroutineScope(Dispatchers.IO).launch { loadBookmarks() }
            }
        }

        @JavascriptInterface
        fun downloadArchive(uuid: String?, name: String, type: String) {
            _browser.post { showLoadingAnimation() }
            executeInThread {
                var asset: ByteArray? = null
                try {
                    asset = _cloudDB.getArchiveBytes(uuid!!)
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                executeInUIThread() {
                    if (asset != null)
                        StorageService(requireActivity()).writeToDiskAndOpen(asset, name, type)
                    hideLoadingAnimation()
                }
            }
        }

        @JavascriptInterface
        fun deleteNode(uuid: String?) {
            _browser.post { showLoadingAnimation() }

            executeInThread() {
                try {
                    _cloudDB.download()
                    _cloudDB.deleteNode(uuid)
                    _cloudDB.persist()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
                finally {
                    _cloudDB.reset()
                }

                executeInUIThread {
                    hideLoadingAnimation()
                }
            }
        }

        @JavascriptInterface
        fun downloadIcon(uuid: String?, elementId: String?, hash: String?) {
            CoroutineScope(Dispatchers.IO).launch {
                var url: String? = null

                try {
                    url = _cloudDB.downloadIcon(uuid!!)
                }
                catch (e: Exception) {
                    e.printStackTrace()
                }

                withContext(Dispatchers.Main) {
                    val script = if (url == null) "setNodeIconExternal(null, \"$elementId\", \"$hash\")"
                                 else "setNodeIconExternal(\"$url\", \"$elementId\", \"$hash\")"
                    _browser.evaluateJavascript(script, null)
                }
            }
        }
    }
}

