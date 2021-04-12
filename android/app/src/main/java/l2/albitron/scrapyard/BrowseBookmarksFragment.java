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
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import l2.albitron.scrapyard.cloud.DropboxProvider;

/**
 * A simple {@link Fragment} subclass.
 * Use the {@link BrowseBookmarksFragment#newInstance} factory method to
 * create an instance of this fragment.
 */
public class BrowseBookmarksFragment extends Fragment {

    // TODO: Rename parameter arguments, choose names that match
    // the fragment initialization parameters, e.g. ARG_ITEM_NUMBER
    private static final String ARG_PARAM1 = "param1";
    private static final String ARG_PARAM2 = "param2";

    // TODO: Rename and change types of parameters
    private String mParam1;
    private String mParam2;

    public BrowseBookmarksFragment() {
        // Required empty public constructor
    }

    /**
     * Use this factory method to create a new instance of
     * this fragment using the provided parameters.
     *
     * @param param1 Parameter 1.
     * @param param2 Parameter 2.
     * @return A new instance of fragment BrowseBookmarksFragment.
     */
    // TODO: Rename and change types and number of parameters
    public static BrowseBookmarksFragment newInstance(String param1, String param2) {
        BrowseBookmarksFragment fragment = new BrowseBookmarksFragment();
        Bundle args = new Bundle();
        args.putString(ARG_PARAM1, param1);
        args.putString(ARG_PARAM2, param2);
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments() != null) {
            mParam1 = getArguments().getString(ARG_PARAM1);
            mParam2 = getArguments().getString(ARG_PARAM2);
        }
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {

        View rootView = inflater.inflate(R.layout.fragment_browse_bookmarks, container, false);
        final Resources r = rootView.getResources();

        String url = "file:///android_asset/browser.html";
        WebView browser = (WebView) rootView.findViewById(R.id.wvBrowseBookmarks);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.loadUrl(url);

        browser.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                ExecutorService executor = Executors.newSingleThreadExecutor();
                Handler handler = new Handler(Looper.getMainLooper());

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
