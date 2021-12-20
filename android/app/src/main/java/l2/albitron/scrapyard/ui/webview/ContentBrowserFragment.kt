package l2.albitron.scrapyard.ui.webview

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import l2.albitron.scrapyard.R
import l2.albitron.scrapyard.cloud.db.CloudDB
import l2.albitron.scrapyard.executeInUIThread
import l2.albitron.scrapyard.executeInThread
import org.apache.commons.text.StringEscapeUtils

class ContentBrowserFragment : Fragment() {
    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val rootView: View = inflater.inflate(R.layout.fragment_content_browser, container, false)
        val browser = rootView.findViewById<View>(R.id.content_browser_web_view) as WebView
        browser.settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        browser.settings.defaultTextEncodingName = "utf-8"
        browser.settings.javaScriptEnabled = true
        browser.webViewClient = TreeWebViewClient(requireActivity(), browser)
        browser.loadUrl("file:///android_asset/content.html")
        return rootView
    }

    private inner class TreeWebViewClient(context: FragmentActivity, browser: WebView) : WebViewClient() {
        private val _context = context
        private val _browser = browser

        override fun onPageFinished(view: WebView, url: String) {
            CoroutineScope(Dispatchers.IO).launch {
                val uuid = requireArguments().getString(ARG_UUID)
                val asset = requireArguments().getString(ARG_ASSET)
                val dbType = requireArguments().getString(ARG_DB_TYPE)
                var assetContent: String? = null

                try {
                    val cloudDB: CloudDB? = CloudDB.newInstance(_context, dbType)
                    assetContent = cloudDB?.downloadAssetRaw(uuid!!, asset!!)

                    if (assetContent == null) {
                        _context.supportFragmentManager.popBackStack()
                        return@launch
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }

                withContext(Dispatchers.Main) {
                    if (assetContent != null) { // TODO: alternative branch (when content is missing)
                        try {
                            val escapedContent = StringEscapeUtils.escapeJson(assetContent)
                            val script = "replaceDocument(\"$escapedContent\", \"$asset\", \"$dbType\")"
                            _browser.evaluateJavascript(script, null)
                        } catch (e: Exception) {
                            e.printStackTrace()
                        }
                    }
                }
            }
        }

        override fun shouldOverrideUrlLoading(view: WebView, url: String?): Boolean {
            return if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                view.context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                true
            } else {
                false
            }
        }
    }

    companion object {
        const val ARG_UUID = "UUID"
        const val ARG_ASSET = "ASSET"
        const val ARG_DB_TYPE = "DB_TYPE"
    }
}