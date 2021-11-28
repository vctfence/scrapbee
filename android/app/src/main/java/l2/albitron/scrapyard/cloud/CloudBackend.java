package l2.albitron.scrapyard.cloud;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.Html;

import com.dropbox.core.json.JsonReadException;

import org.apache.commons.lang3.StringUtils;
import org.apache.commons.validator.routines.UrlValidator;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.select.Elements;

import java.net.URL;
import java.util.Arrays;

import l2.albitron.scrapyard.Scrapyard;
import l2.albitron.scrapyard.cloud.exceptions.CloudNotAuthorizedException;
import l2.albitron.scrapyard.cloud.json.Node;

public class CloudBackend {

    private final int MAX_TITLE_LENGTH = 60;

    public static final String EXTRA_TODO_STATE = "l2.albitron.scrapyard.cloud.extra.TODO_STATE";
    public static final String EXTRA_TODO_DETAILS = "l2.albitron.scrapyard.cloud.extra.TODO_DETAILS";

    Context context;
    CloudProvider provider;

    public CloudBackend(Context context) throws CloudNotAuthorizedException, JsonReadException {
        this.context = context;
        this.provider = new DropboxProvider(context);
    }

    public void shareBookmark(String path, String referrer, String content_type, Bundle extras) throws Exception {
        CloudDB db = provider.getDB();

        Node targetGroup = !StringUtils.isBlank(path)
            ? db.getOrCreateGroup(path)
            : null;

        String parentId = targetGroup == null? Scrapyard.CLOUD_SHELF_UUID: targetGroup.uuid;

        Node bookmark = new Node();
        bookmark.parentId = parentId;
        db.addNode(bookmark);

        Long todoState = null;
        String extraTODO = extras.getString(EXTRA_TODO_STATE);

        if (extraTODO != null)
            switch (extraTODO) {
                case "TODO":
                    todoState = Scrapyard.TODO_STATE_TODO;
                    break;
                case "WAITING":
                    todoState = Scrapyard.TODO_STATE_WAITING;
                    break;
                case "POSTPONED":
                    todoState = Scrapyard.TODO_STATE_POSTPONED;
                    break;
            }

        if ("application/pdf".equals(content_type)) {
            bookmark.contentType = "application/pdf";
            Uri uri = (Uri)extras.get(Intent.EXTRA_STREAM);

            // works only if the calling activity is still running, which may be achieved by the application of
            // @android:style/Theme.Translucent.NoTitleBar
            // without finishing the activity in onCreate, but only after sharing...

            // see also: https://stackoverflow.com/questions/25841544/how-to-finish-activity-from-service-class-in-android

//            Cursor returnCursor =
//                context.getContentResolver().query(uri, null, null, null, null);
//
//            returnCursor.moveToFirst();
//
//            System.out.println("---NAME-----------------");
//            returnCursor.getString(returnCursor.getColumnIndex(OpenableColumns.DISPLAY_NAME));
//            System.out.println("---SIZE-----------------");
//            System.out.println(returnCursor.getLong(returnCursor.getColumnIndex(OpenableColumns.SIZE)));
//
//
//            //context.getContentResolver().openInputStream(uri); ...
        }
        else {
            String text = getSharedText(referrer, extras);
            String url = getSharedURL(referrer, extras);
            String title = getSharedTitle(referrer, extras);

            if (title == null && text != null) {
                title = getTitleFromText(text);
            }

            if (title == null && url != null) {
                try {
                    title = new URL(url).getHost();
                } catch (Exception e) {}
            }

            bookmark.uri = url;
            bookmark.name = title;
            bookmark.todoState = todoState;
            bookmark.details = extras.getString(EXTRA_TODO_DETAILS);
            bookmark.type = text != null? Scrapyard.NODE_TYPE_ARCHIVE: Scrapyard.NODE_TYPE_BOOKMARK;
            //System.out.println(getFavicon(url));

            bookmark.icon = getFaviconFromURL(url);

            if (bookmark.type == Scrapyard.NODE_TYPE_ARCHIVE && url == null) {
                bookmark.type = Scrapyard.NODE_TYPE_NOTES;
                bookmark.hasNotes = true;
            }

            provider.persistDB(db);

            if (text != null)
                if (bookmark.type == Scrapyard.NODE_TYPE_ARCHIVE)
                    db.storeBookmarkData(bookmark, textToHTMLAttachment(url, text));
                else if (bookmark.type == Scrapyard.NODE_TYPE_NOTES)
                    db.storeBookmarkNotes(bookmark, text);
        }
    }

    protected String getSharedTitle(String referrer, Bundle extras) {
        String subject = extras.getString(Intent.EXTRA_SUBJECT);
        String title = extras.getString(Intent.EXTRA_TITLE);
        String result = null;

        if (!StringUtils.isBlank(title))
            result = title;

        if (!StringUtils.isBlank(subject))
            result = subject;

        if (result != null && (result.length() >= MAX_TITLE_LENGTH * 2))
            result = getTitleFromText(result);
        else if ("Share via".equals(result))
            result = getTitleFromText(extras.getString(Intent.EXTRA_TEXT));

        return result;
    }

    protected String getSharedURL(String referrer, Bundle extras) {
        String text = extras.getString(Intent.EXTRA_TEXT);

        if (StringUtils.isBlank(text))
            return null;

        if (UrlValidator.getInstance().isValid(text))
            return text;

        boolean pocket = StringUtils.startsWith(referrer, "com.ideashower.readitlater");
        boolean chrome = StringUtils.startsWith(referrer, "com.android.chrome");

        if (pocket || chrome) {
            String [] lines = StringUtils.split(text, "\n");

            if (lines.length > 1) {
                String url = lines[lines.length - 1].trim();

                if (url.matches("^https?://(.*)"))
                    return url;
            }
        }

        return null;
    }

    protected String getSharedText(String referrer, Bundle extras) {
        String text = extras.getString(Intent.EXTRA_TEXT);

        if (StringUtils.isBlank(text) || UrlValidator.getInstance().isValid(text))
            return null;

        boolean pocket = StringUtils.startsWith(referrer, "com.ideashower.readitlater");
        boolean chrome = StringUtils.startsWith(referrer, "com.android.chrome");

        if (pocket || chrome) {
            String [] lines = StringUtils.split(text, "\n");
            String [] text_lines = lines;

            if (lines.length > 1) {
                String url = lines[lines.length - 1].trim();

                if (url.matches("^https?://(.*)"))
                    text_lines = Arrays.copyOfRange(lines, 0, lines.length - 1);
            }

            text = StringUtils.join(text_lines, "\n");

            if (chrome) {
                text = text.replaceAll("^\"", "");
                text = text.replaceAll("\"$", "");
            }
        }

        return text;
    }

    private String getTitleFromText(String text) {
        boolean trimmed = text.length() > MAX_TITLE_LENGTH;
        String title = text.substring(0, trimmed? MAX_TITLE_LENGTH: text.length() - 1);

        if (title.length() > 0) {
            int space = title.lastIndexOf(" ");

            if (space > 0)
                title = title.substring(0, space);
        }

        return title.trim() + (trimmed? "...": "");
    }

    private String textToHTMLAttachment(String url, String text) {
        String [] lines = StringUtils.split(text, "\n");

        StringBuffer buffer = new StringBuffer();
        buffer.append("<html>");
        buffer.append("<head>");
        buffer.append("<style>.content {width: 600px; margin: 10px;} p {text-align: justify}</style>");
        buffer.append("<meta name=\"savepage-url\" content=\"" + url + "\">");
        buffer.append("</head>");
        buffer.append("<body>");
        buffer.append("<div class='content'>");

        for (String line : lines) {
            buffer.append("<p>" + Html.escapeHtml(line) + "</p>");
        }

        buffer.append("</div>");
        buffer.append("</body>");
        buffer.append("</html>");

        return buffer.toString();
    }

    private String getFaviconFromURL(String url) {
        try {
            Document doc = Jsoup.connect(url).get();
            Elements links = doc.select("head link[rel*='icon'], head link[rel*='shortcut']");

            URL baseUrl = new URL(url);

            if (baseUrl.getHost().endsWith("wikipedia.org"))
                return "https://en.wikipedia.org/favicon.ico";

            if (links.size() > 0) {
                URL faviconUrl = new URL(baseUrl, links.get(0).attr("href"));
                return faviconUrl.toString();
            }
            else {
                StringBuilder builder = new StringBuilder();
                URL faviconUrl = new URL(url);

                builder.append(faviconUrl.getProtocol() + "://")
                    .append(faviconUrl.getHost());

                if (faviconUrl.getPort() > 0)
                    builder.append(":" + faviconUrl.getPort());

                builder.append("/favicon.ico");

                return builder.toString();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        return null;
    }

    private String getTitleFromURL(String url) {
        try {
            Document doc = Jsoup.connect(url).get();
            Elements title = doc.select("head title");

            if (title.size() > 0)
                return title.get(0).text();
        } catch (Exception e) {
            e.printStackTrace();
        }

        return null;
    }

}
