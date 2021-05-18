package l2.albitron.scrapyard;

import android.content.Intent;
import android.content.res.Resources;
import android.net.Uri;
import android.os.Bundle;

import androidx.fragment.app.Fragment;

import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.UnsupportedEncodingException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import l2.albitron.scrapyard.cloud.DropboxProvider;

public class BrowseArchiveFragment extends Fragment {

    private static final String ARG_UUID = "UUID";
    private static final String ARG_ASSET = "ASSET";

    private String uuid;
    private String asset;

    public BrowseArchiveFragment() {
    }

    public static BrowseArchiveFragment newInstance(String uuid, String asset) {
        BrowseArchiveFragment fragment = new BrowseArchiveFragment();
        Bundle args = new Bundle();
        args.putString(ARG_UUID, uuid);
        args.putString(ARG_ASSET, asset);
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments() != null) {
            uuid = getArguments().getString(ARG_UUID);
            asset = getArguments().getString(ARG_ASSET);
        }
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        View rootView = inflater.inflate(R.layout.fragment_browse_archive, container, false);
        final Resources r = rootView.getResources();

        String url = "file:///android_asset/browser.html";
        WebView browser = (WebView) rootView.findViewById(R.id.wvBrowseArchive);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        browser.getSettings().setDefaultTextEncodingName("utf-8");
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
                        final byte[][] assetBytes = new byte[][]{null};

                        try {
                            DropboxProvider dropbox =
                                new DropboxProvider(BrowseArchiveFragment.this.getActivity());
                            assetBytes[0] = dropbox.getAssetBytes(DropboxProvider.DROPBOX_APP_PATH
                                + "/" + uuid + "." + asset);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }

                        handler.post(() -> {
                            if (assetBytes[0] != null) {
                                try {
                                    String base64 = Base64
                                        .encodeToString(assetBytes[0], Base64.NO_WRAP);

                                    String links = "";
                                    if ("data".equals(asset)) {
                                        links = "<link rel='stylesheet' href='css/markers.css'/>";
                                    }
                                    else if ("view".equals(asset)) {
                                        links = "<link rel='stylesheet' href='css/notes.css'/>"
                                            + "<link rel='stylesheet' href='css/org.css'/>";
                                    }

                                    String script = "replaceDocument(\"" + base64 + "\", \"" + links + "\")";
                                    browser.evaluateJavascript(script, null);

                                } catch (Exception e) {
                                    e.printStackTrace();
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
