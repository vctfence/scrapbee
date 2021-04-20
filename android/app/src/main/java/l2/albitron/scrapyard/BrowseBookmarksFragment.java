
package l2.albitron.scrapyard;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.res.Resources;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentTransaction;

import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import l2.albitron.scrapyard.cloud.CloudNotAuthorizedException;
import l2.albitron.scrapyard.cloud.CloudOperationsService;
import l2.albitron.scrapyard.cloud.DropboxProvider;

public class BrowseBookmarksFragment extends Fragment {

    public BrowseBookmarksFragment() {
        // Required empty public constructor
    }

    public static BrowseBookmarksFragment newInstance() {
        return new BrowseBookmarksFragment();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    private void loadBookmarks(WebView browser) {
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Handler handler = new Handler(Looper.getMainLooper());
        //System.out.println(view.getSettings().getUserAgentString());
        executor.execute(() -> {
            final String[] json = new String[]{null};

            try {
                DropboxProvider dropbox =
                    new DropboxProvider(BrowseBookmarksFragment.this.getActivity());
                json[0] = dropbox.getDBRaw();
            } catch (CloudNotAuthorizedException e) {
                handler.post(() -> {
                    Context context = getActivity().getApplicationContext();
                    Toast.makeText(context,
                        getString(R.string.needToConfigureCloudProvider),
                        Toast.LENGTH_LONG).show();

                    Intent activityIntent = new Intent(context, MainActivity.class);
                    activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                    startActivity(activityIntent);
                });
            } catch (Exception e) {
                e.printStackTrace();
            }

            handler.post(() -> {
                if (json[0] != null) {
                    String script = "injectCloudBookmarks(" + json[0] + ")";
                    browser.evaluateJavascript(script, null);
                }
            });
        });
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {

        View rootView = inflater.inflate(R.layout.fragment_browse_bookmarks, container, false);
        final Resources r = rootView.getResources();

        String url = "file:///android_asset/browser.html";

        //WebView.setWebContentsDebuggingEnabled(true);

        WebView browser = (WebView) rootView.findViewById(R.id.wvBrowseBookmarks);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        browser.loadUrl(url);


        browser.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                loadBookmarks(browser);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    view.getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    return true;
                } else {
                    return false;
                }
            }

        });

        class WebAppInterface {
            Context context;

            WebAppInterface(Context c) {
                context = c;
            }

            @JavascriptInterface
            public void openArchive(String uuid, String asset) {
                FragmentTransaction ft = BrowseBookmarksFragment.this.getActivity()
                    .getSupportFragmentManager().beginTransaction();
                ft.replace(R.id.content_frame, BrowseArchiveFragment.newInstance(uuid, asset));
                ft.addToBackStack("stack");
                ft.commit();
            }

            private void openIntent(Uri uri, String type) {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NO_HISTORY);
                    intent.setDataAndType(uri, type);
                    startActivity(intent);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }

            private boolean writeToDisk(byte [] bytes, String name, String type) {
                try {
                    MimeTypeMap mimeTypeMap = MimeTypeMap.getSingleton();
                    String extension = mimeTypeMap.getExtensionFromMimeType(type);
                    String fileName = name.endsWith(extension)? name: name + "." + extension;

                    ContentValues values = new ContentValues();

                    Uri uri;

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ContentResolver resolver = getActivity().getContentResolver();
                        values.put(MediaStore.Files.FileColumns.DISPLAY_NAME, fileName);
                        values.put(MediaStore.Files.FileColumns.MIME_TYPE, type);
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download");
                        values.put(MediaStore.MediaColumns.IS_PENDING, true);
                        uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                        try (OutputStream output = resolver.openOutputStream(uri)) {
                            output.write(bytes);
                            output.flush();
                        }
                        finally {
                            values = new ContentValues();
                            values.put(MediaStore.Images.ImageColumns.IS_PENDING, false);
                            resolver.update(uri, values, null, null);
                        }
                    } else {
                        File directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        File file = new File(directory, fileName);
                        uri = Uri.fromFile(file);

                        file.getParentFile().mkdirs();

                        if (!file.exists()) {
                            file.createNewFile();
                            try (FileOutputStream fos = new FileOutputStream(file)) {
                                fos.write(bytes);
                                fos.flush();
                            }
                        }
                    }

                    openIntent(uri, type);

                } catch (Exception e) {
                    e.printStackTrace();
                }

                return false;
            }

            @JavascriptInterface
            public void downloadArchive(String uuid, String name, String type) {
                ExecutorService executor = Executors.newSingleThreadExecutor();
                Handler handler = new Handler(Looper.getMainLooper());
                //System.out.println(view.getSettings().getUserAgentString());

                browser.post(() -> browser.evaluateJavascript("showAnimation()", null));

                executor.execute(() -> {
                    final byte[][] assetBytes = new byte[][]{null};

                    try {
                        DropboxProvider dropbox =
                            new DropboxProvider(BrowseBookmarksFragment.this.getActivity());
                        assetBytes[0] = dropbox.getAssetBytes(DropboxProvider.DROPBOX_APP_PATH
                            + "/" + uuid + ".data");
                    } catch (Exception e) {
                        e.printStackTrace();
                    }

                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (assetBytes[0] != null)
                                writeToDisk(assetBytes[0], name, type);
                            browser.post(() -> browser.evaluateJavascript("hideAnimation()", null));
                        }
                    });
                });
            }

            @JavascriptInterface
            public void refreshTree() {
                browser.post(() -> browser.evaluateJavascript("showAnimation()", null));
                browser.post(() -> loadBookmarks(browser));
            }
        }

        browser.addJavascriptInterface(new WebAppInterface(getActivity()), "Android");

        return rootView;
    }
}
