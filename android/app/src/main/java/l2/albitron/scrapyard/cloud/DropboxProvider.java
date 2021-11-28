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

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import l2.albitron.scrapyard.BuildConfig;
import l2.albitron.scrapyard.Scrapyard;
import l2.albitron.scrapyard.cloud.exceptions.CloudDownloadException;
import l2.albitron.scrapyard.cloud.exceptions.DropboxNotAuthorizedException;

import static android.content.Context.MODE_PRIVATE;

public class DropboxProvider implements CloudProvider {

    public static final String DROPBOX_APP_PATH = "/Cloud";

    DbxClientV2 client;

    public DropboxProvider(Context context) throws DropboxNotAuthorizedException, JsonReadException {
        SharedPreferences prefs = context.getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE);
        String credentialStr = prefs.getString(Scrapyard.PREF_DROPBOX_AUTH_TOKEN, null);

        if (credentialStr != null && !credentialStr.isEmpty()) {
            DbxRequestConfig config = DbxRequestConfig.newBuilder("Scrapyard").build();
            DbxCredential credential = DbxCredential.Reader.readFully(credentialStr);
            client = new DbxClientV2(config, credential);
        }
        else
            throw new DropboxNotAuthorizedException();
    }

    public String getCloudPath(String file) {
        return DROPBOX_APP_PATH + "/" + file;
    }

    private void copyStream(InputStream source, OutputStream target) throws IOException {
        byte[] buf = new byte[8192];
        int length;
        while ((length = source.read(buf)) > 0) {
            target.write(buf, 0, length);
        }
    }

    String downloadTextFile(String path) throws CloudDownloadException {
        try {
            DbxDownloader<FileMetadata> downloader = client.files().download(path);
            int fileSize = (int)downloader.getResult().getSize();

            try (ByteArrayOutputStream out = new ByteArrayOutputStream(fileSize)) {
                copyStream(downloader.getInputStream(), out);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (IOException e) {
                e.printStackTrace();
            }
            finally {
                downloader.close();
            }
        }
        catch (DbxException e) {
           if (BuildConfig.DEBUG)
               e.printStackTrace();

            if (e instanceof DownloadErrorException) {
                throw new CloudDownloadException(e);
            }
        }

        return null;
    }

    public void writeTextFile(String path, String content) {
        try (InputStream in = new ByteArrayInputStream(content.getBytes(StandardCharsets.UTF_8))) {
            client.files().uploadBuilder(path)
                .withMode(WriteMode.OVERWRITE)
                .uploadAndFinish(in);
        }
        catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public CloudDB getDB() {
        CloudDB db = new CloudDB(this);
        try {
            String content = downloadTextFile(getCloudPath(CloudDB.CLOUD_DB_INDEX));
            db.deserialize(content);
        } catch (CloudDownloadException e) {
            e.printStackTrace();
        }
        return db;
    }

    @Override
    public CloudDB getEmptyDB() {
        return new CloudDB(this);
    }

    @Override
    public void persistDB(CloudDB db) throws Exception {
        String content = db.serialize();
        if (content != null)
            writeCloudFile(CloudDB.CLOUD_DB_INDEX, content);
    }

    @Override
    public String readCloudFile(String file) {
        try {
            return downloadTextFile(getCloudPath(file));
        }
        catch (CloudDownloadException e) {
            return null;
        }
    }

    @Override
    public void writeCloudFile(String file, String content) {
        writeTextFile(getCloudPath(file), content);
    }

    @Override
    public void deleteCloudFile(String file) {
        try {
            client.files().deleteV2(getCloudPath(file));
        }
        catch (Exception e) {
            e.printStackTrace();
        }
    }
}
