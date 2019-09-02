package l2.albitron.scrapyard.cloud;

public interface CloudDB {
    BookmarkRecord getOrCreateGroup(String path);
    BookmarkRecord addNode(BookmarkRecord node);
    void storeBookmarkData(BookmarkRecord node, String text) throws Exception;
    void storeBookmarkNotes(BookmarkRecord node, String text) throws Exception;
}
