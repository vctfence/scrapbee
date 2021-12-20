package l2.albitron.scrapyard.cloud.sharing

import android.content.Context
import android.content.Intent
import android.text.Html
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import l2.albitron.scrapyard.R
import l2.albitron.scrapyard.Scrapyard
import l2.albitron.scrapyard.Settings
import l2.albitron.scrapyard.cloud.db.CloudDB
import l2.albitron.scrapyard.cloud.db.SyncStorageDB
import l2.albitron.scrapyard.cloud.db.model.Node
import l2.albitron.scrapyard.cloud.sharing.exceptions.SharingException
import org.jsoup.Jsoup
import java.lang.Exception
import java.lang.StringBuilder
import java.net.URL
import java.util.*

private const val MAX_TITLE_LENGTH = 60

class SharingService(context: Context) {
    private val _context = context

    companion object {
        const val EXTRA_REFERRER = "l2.albitron.scrapyard.sharing.extra.REFERRER"
        const val EXTRA_TODO_STATE = "l2.albitron.scrapyard.sharing.extra.TODO_STATE"
        const val EXTRA_TODO_DETAILS = "l2.albitron.scrapyard.sharing.extra.TODO_DETAILS"
        const val EXTRA_CONTENT_TYPE = "l2.albitron.scrapyard.sharing.extra.CONTENT_TYPE"
        const val EXTRA_CONFIGURE_PROVIDERS = "l2.albitron.scrapyard.sharing.extra.CONFIGURE_PROVIDERS"
    }

    fun shareBookmark(params: Map<String, Any?>) {
        val settings = Settings(_context)

        val db = runBlocking { CloudDB.newInstance(_context, settings.shareToShelf)!! }

        db.download()

        if (SyncStorageDB.DATABASE_TYPE == db.getType() && db.isEmpty())
            throw SharingException(R.string.can_not_share_to_empty_sync)

        val targetGroup = db.getOrCreateSharingFodler(settings.sharedFolderName)
        val bookmark = Node()

        val (title, text, url) = getBookmarkProperties(params)

        bookmark.name = title
        bookmark.uri = url
        bookmark.icon = getFaviconFromURL(url)
        //System.out.println(getFavicon(url));

        bookmark.todoState = getBookmarkTODOState(params)

        bookmark.details = params[EXTRA_TODO_DETAILS] as? String

        bookmark.type = if (text != null) Scrapyard.NODE_TYPE_ARCHIVE else Scrapyard.NODE_TYPE_BOOKMARK
        if (bookmark.type == Scrapyard.NODE_TYPE_ARCHIVE && url == null) {
            bookmark.type = Scrapyard.NODE_TYPE_NOTES
            bookmark.hasNotes = true
        }
        else if (bookmark.type == Scrapyard.NODE_TYPE_ARCHIVE)
            bookmark.contentType = "text/html"

        db.addNode(bookmark, targetGroup)

        db.persist()

        if (text != null) {
            if (bookmark.type == Scrapyard.NODE_TYPE_ARCHIVE)
                db.storeNewBookmarkData(bookmark, textToHTMLAttachment(text))
            else if (bookmark.type == Scrapyard.NODE_TYPE_NOTES)
                db.storeNewBookmarkNotes(bookmark, text)
        }
    }

    fun getBookmarkProperties(params: Map<String, Any?>): Triple<String?, String?, String?> {
        val url = getSharedURL(params)
        val text = getSharedText(params)
        var title = getSharedTitle(params)
        if (title == null && text != null)
            title = shortenTitle(text)
        if (title == null && url != null)
            try {
                title = URL(url).host
            }
            catch (e: Exception) {}
        return Triple(title, text, url)
    }

    private fun getBookmarkTODOState(params: Map<String, Any?>): Long? {
        var todoState: Long? = null
        val todoStateText = params[EXTRA_TODO_STATE] as? String
        if (todoStateText != null)
            when (todoStateText) {
                "TODO" -> todoState = Scrapyard.TODO_STATE_TODO
                "WAITING" -> todoState = Scrapyard.TODO_STATE_WAITING
                "POSTPONED" -> todoState = Scrapyard.TODO_STATE_POSTPONED
            }
        return todoState
    }

    private fun getSharedTitle(params: Map<String, Any?>): String? {
        val subject = params[Intent.EXTRA_SUBJECT] as? String
        val title = params[Intent.EXTRA_TITLE] as? String
        var result: String? = null

        if (title?.isNotBlank() == true)
            result = title

        if (subject?.isNotBlank() == true)
            result = subject

        if (result != null && result.length >= MAX_TITLE_LENGTH * 2)
            result = shortenTitle(result)
        else if ("Share via" == result)
            result = shortenTitle(params[Intent.EXTRA_TEXT] as? String)

        return result
    }

    private fun getSharedURL(params: Map<String, Any?>): String? {
        val text = params[Intent.EXTRA_TEXT] as? String

        if (text == null || text.isBlank())
            return null

        if (text.matches("^https?://(.*)".toRegex()))
            return text

        val referrer = params[EXTRA_REFERRER] as? String
        val pocket = referrer?.startsWith("com.ideashower.readitlater") == true
        val chrome = referrer?.startsWith("com.android.chrome") == true

        if (pocket || chrome) {
            val lines = text.split("\n").toTypedArray()
            if (lines.size > 1) {
                val url = lines[lines.size - 1].trim { it <= ' ' }
                if (url.matches("^https?://(.*)".toRegex()))
                    return url
            }
        }

        return null
    }

    private fun getSharedText(params: Map<String, Any?>): String? {
        var result: String? = params[Intent.EXTRA_TEXT] as? String
        if (result == null || result.matches("^https?://(.*)".toRegex()))
            return null

        val referrer = params[EXTRA_REFERRER] as? String
        val pocket = referrer?.startsWith("com.ideashower.readitlater") == true
        val chrome = referrer?.startsWith("com.android.chrome") == true

        if (pocket || chrome) {
            val lines = result.split("\n").toTypedArray()
            var textLines = lines

            if (lines.size > 1) {
                val url = lines[lines.size - 1].trim { it <= ' ' }
                if (url.matches("^https?://(.*)".toRegex()))
                    textLines = Arrays.copyOfRange(lines, 0, lines.size - 1)
            }

            result = textLines.joinToString("\n")

            if (chrome) {
                result = result.replace("^\"".toRegex(), "")
                result = result.replace("\"$".toRegex(), "")
            }
        }

        return result
    }

    private fun shortenTitle(text: String?): String {
        val trimmed = text!!.length > MAX_TITLE_LENGTH
        var title = text.substring(0, if (trimmed) MAX_TITLE_LENGTH else text.length - 1)
        if (title.length > 0) {
            val space = title.lastIndexOf(" ")
            if (space > 0)
                title = title.substring(0, space)
        }
        return title.trim { it <= ' ' } + if (trimmed) "..." else ""
    }

    private fun textToHTMLAttachment(text: String): String {
        val lines = text.split("\n")
        val buffer = StringBuffer()
        buffer.append("<html>")
        buffer.append("<head>")
        buffer.append("<style>.content {width: 600px; margin: 10px;} p {text-align: justify}</style>")
        buffer.append("</head>")
        buffer.append("<body>")
        buffer.append("<div class='content'>")
        for (line in lines) {
            buffer.append("<p>" + Html.escapeHtml(line) + "</p>")
        }
        buffer.append("</div>")
        buffer.append("</body>")
        buffer.append("</html>")
        return buffer.toString()
    }

    private fun getFaviconFromURL(url: String?): String? {
        try {
            val doc = Jsoup.connect(url).get()
            val links = doc.select("head link[rel*='icon'], head link[rel*='shortcut']")
            val baseUrl = URL(url)

            if (baseUrl.host.endsWith("wikipedia.org"))
                return "https://en.wikipedia.org/favicon.ico"

            return if (links.size > 0) {
                val faviconUrl = URL(baseUrl, links[0].attr("href"))
                faviconUrl.toString()
            } else {
                val builder = StringBuilder()
                val faviconUrl = URL(url)
                builder.append(faviconUrl.protocol + "://")
                       .append(faviconUrl.host)
                if (faviconUrl.port > 0)
                    builder.append(":" + faviconUrl.port)
                builder.append("/favicon.ico")
                builder.toString()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    private fun getTitleFromURL(url: String): String? {
        try {
            val doc = Jsoup.connect(url).get()
            val title = doc.select("head title")
            if (title.size > 0) return title[0].text()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }
}
