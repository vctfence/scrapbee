package l2.albitron.scrapyard.cloud;

import com.annimon.stream.Stream;
import com.annimon.stream.function.Predicate;
import com.dropbox.core.v2.files.FileMetadata;
import com.dropbox.core.v2.files.WriteMode;

import org.apache.commons.lang3.StringUtils;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

import l2.albitron.scrapyard.Scrapyard;

public class DropboxDB implements CloudDB {

    List<BookmarkRecord> bookmarks;
    DropboxProvider provider;

    public DropboxDB(DropboxProvider provider, List<BookmarkRecord> bookmarks) {
        this.provider = provider;
        this.bookmarks = bookmarks;
    }

    protected BookmarkRecord getMeta() {
        Predicate<BookmarkRecord> metaFilter =
            b -> StringUtils.equalsIgnoreCase(b.cloud, Scrapyard.APP_NAME);

        return Stream.of(bookmarks).filter(metaFilter).findFirst().orElse(null);
    }

    @Override
    public BookmarkRecord getOrCreateGroup(String path) {
        final String groupName =
            path.replace("/", "_").replace("\\", "_");

        Predicate<BookmarkRecord> groupFilter =
            b -> (b.type != null && b.type == Scrapyard.NODE_TYPE_GROUP)
                 && (b.parentId != null && b.parentId == Scrapyard.CLOUD_SHELF_ID)
                && StringUtils.equalsIgnoreCase(b.name, groupName);

        BookmarkRecord group = Stream.of(bookmarks).filter(groupFilter).findFirst().orElse(null);

        if (group == null) {
            BookmarkRecord meta = getMeta();

            group = new BookmarkRecord();
            group.id = meta.nextId++;
            group.uuid = Scrapyard.getUUID();
            group.pos = Scrapyard.DEFAULT_POSITION;
            group.type = Scrapyard.NODE_TYPE_GROUP;
            group.name = groupName;
            group.parentId = Scrapyard.CLOUD_SHELF_ID;
            group.dateAdded = System.currentTimeMillis();
            group.dateModified = group.dateAdded;

            bookmarks.add(group);
        }

        return group;
    }

    @Override
    public BookmarkRecord addNode(BookmarkRecord node) {
        BookmarkRecord meta = getMeta();

        node.id = meta.nextId++;
        node.uuid = Scrapyard.getUUID();

        node.dateAdded = System.currentTimeMillis();
        node.dateModified = node.dateAdded;

        node.pos = Scrapyard.DEFAULT_POSITION;

        bookmarks.add(node);

        return node;
    }

    @Override
    public void storeBookmarkData(BookmarkRecord node, String text) {
        try (InputStream in = new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8))) {
            String dbxFileName = provider.DROPBOX_APP_PATH + "/" + node.uuid + ".data";
            FileMetadata metadata = provider.client.files().uploadBuilder(dbxFileName)
                .withMode(WriteMode.OVERWRITE)
                .uploadAndFinish(in);
        }
        catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void storeBookmarkNotes(BookmarkRecord node, String text) {
        try (InputStream in = new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8))) {
            String dbxFileName = provider.DROPBOX_APP_PATH + "/" + node.uuid + ".notes";
            FileMetadata metadata = provider.client.files().uploadBuilder(dbxFileName)
                .withMode(WriteMode.OVERWRITE)
                .uploadAndFinish(in);
        }
        catch (Exception e) {
            e.printStackTrace();
        }
    }
}
