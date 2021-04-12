package l2.albitron.scrapyard.cloud;

import android.content.Context;
import android.content.SharedPreferences;

import com.dropbox.core.DbxDownloader;
import com.dropbox.core.DbxException;
import com.dropbox.core.DbxRequestConfig;
import com.dropbox.core.json.JsonReadException;
import com.dropbox.core.oauth.DbxCredential;
import com.dropbox.core.v2.DbxClientV2;
import com.dropbox.core.v2.files.DownloadErrorException;
import com.dropbox.core.v2.files.FileMetadata;
import com.dropbox.core.v2.files.WriteMode;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import l2.albitron.scrapyard.BuildConfig;
import l2.albitron.scrapyard.Scrapyard;

import static android.content.Context.MODE_PRIVATE;

public class DropboxProvider implements CloudProvider {

    final String DROPBOX_APP_PATH = "/Cloud";
    final String DROPBOX_INDEX_PATH = "/Cloud/index.json";

    DbxClientV2 client;

    public DropboxProvider(Context context) throws DropboxNotAuthorizedException, JsonReadException {
        SharedPreferences prefs = context.getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE);

        String credentialStr =
            prefs.getString(Scrapyard.PREF_DROPBOX_AUTH_TOKEN, null);

        if (credentialStr != null && !credentialStr.isEmpty()) {
            DbxRequestConfig config = DbxRequestConfig.newBuilder("Scrapyard").build();
            DbxCredential credential = DbxCredential.Reader.readFully(credentialStr);
            client = new DbxClientV2(config, credential);
        }
        else
            throw new DropboxNotAuthorizedException();
    }

    public CloudDB getDB() {
        try {
            DbxDownloader<FileMetadata> downloader = client.files().download(DROPBOX_INDEX_PATH);

            try (ByteArrayOutputStream out = new ByteArrayOutputStream((int)downloader.getResult().getSize())) {
                client.files().download(DROPBOX_INDEX_PATH).download(out);
                String json = new String(out.toByteArray(), StandardCharsets.UTF_8);

                ObjectMapper objectMapper = new ObjectMapper();
                List<BookmarkRecord> bookmarks = objectMapper.readValue(json, new TypeReference<List<BookmarkRecord>>() {});

                return new DropboxDB(this, bookmarks);

            } catch (IOException e) {
                e.printStackTrace();
            }
        } catch (DbxException e) {
            if (BuildConfig.DEBUG)
                e.printStackTrace();

            if (e instanceof DownloadErrorException) {
                List<BookmarkRecord> bookmarks = new ArrayList<>();

                BookmarkRecord meta = new BookmarkRecord();
                meta.cloud = Scrapyard.APP_NAME;
                meta.date = System.currentTimeMillis();
                meta.nextId = 1L;

                bookmarks.add(meta);

                return new DropboxDB(this, bookmarks);
            }
        }

        return null;
    }

    public String getDBRaw() {
        try {
            DbxDownloader<FileMetadata> downloader = client.files().download(DROPBOX_INDEX_PATH);

            try (ByteArrayOutputStream out = new ByteArrayOutputStream((int)downloader.getResult().getSize())) {
                client.files().download(DROPBOX_INDEX_PATH).download(out);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                e.printStackTrace();
            }
        } catch (DbxException e) {
            if (BuildConfig.DEBUG)
                e.printStackTrace();
        }

        return null;
    }

    public void persistDB(CloudDB db) throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        String json = objectMapper.writeValueAsString(((DropboxDB)db).bookmarks);

        try (InputStream in = new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8))) {
            FileMetadata metadata = client.files().uploadBuilder(DROPBOX_INDEX_PATH)
                .withMode(WriteMode.OVERWRITE)
                .uploadAndFinish(in);
        }
    }

}
