package l2.albitron.scrapyard;

import java.util.UUID;

public interface Scrapyard {

    long CLOUD_VERSION = 1;

    long NODE_TYPE_SHELF = 1;
    long NODE_TYPE_GROUP = 2;
    long NODE_TYPE_BOOKMARK = 3;
    long NODE_TYPE_ARCHIVE = 4;
    long NODE_TYPE_SEPARATOR = 5;
    long NODE_TYPE_NOTES = 6;

    String CLOUD_SHELF_UUID = "cloud";
    String CLOUD_EXTERNAL_NAME = "cloud";

    long DEFAULT_POSITION = 2147483647L;

    long TODO_STATE_TODO = 1;
    long TODO_STATE_DONE = 4;
    long TODO_STATE_WAITING = 2;
    long TODO_STATE_POSTPONED = 3;
    long TODO_STATE_CANCELLED = 5;


    String APP_NAME = "Scrapyard";
    String MAIN_PREFERENCES = "ScrapyardMainPreferences";
    String PREF_DEFAULT_BOOKMARK_FOLDER = "PREF_DEFAULT_BOOKMARK_FOLDER";
    String PREF_DROPBOX_AUTH_TOKEN = "PREF_DROPBOX_AUTH_TOKEN";

    static String getUUID() {
        return UUID.randomUUID()
            .toString()
            .replace("-", "")
            .toUpperCase();
    }
}
