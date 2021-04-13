package l2.albitron.scrapyard;

import android.content.Intent;
import android.content.res.Resources;
import android.net.Uri;
import android.os.Bundle;

import androidx.fragment.app.Fragment;

import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import l2.albitron.scrapyard.cloud.DropboxProvider;

public class BrowseBookmarksFragment extends Fragment {

    public BrowseBookmarksFragment() {
        // Required empty public constructor
    }

    public static BrowseBookmarksFragment newInstance(String param1, String param2) {
        return new BrowseBookmarksFragment();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {

        View rootView = inflater.inflate(R.layout.fragment_browse_bookmarks, container, false);
        final Resources r = rootView.getResources();

        String url = "file:///android_asset/browser.html";
        WebView browser = (WebView) rootView.findViewById(R.id.wvBrowseBookmarks);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        browser.loadUrl(url);

        browser.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                ExecutorService executor = Executors.newSingleThreadExecutor();
                Handler handler = new Handler(Looper.getMainLooper());
                //System.out.println(view.getSettings().getUserAgentString());
                executor.execute(new Runnable() {
                    @Override
                    public void run() {
                        final String[] json = new String[]{null};

                        try {
                            DropboxProvider dropbox =
                                new DropboxProvider(BrowseBookmarksFragment.this.getActivity());
                            json[0] = dropbox.getDBRaw();
                        } catch (Exception e) {
                            e.printStackTrace();
                        }

                        handler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (json[0] != null) {
                                    String script = r.getString(R.string.injectCloudBookmarks);
                                    String [] parts = script.split("#bookmarks#");
                                    script = parts[0] + json[0] + parts[1];
                                    //System.out.println(script);
                                    browser.evaluateJavascript(script, null);
                                }
                            }
                        });
                    }
                });
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

        return rootView;
    }
}
