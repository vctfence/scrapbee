package l2.albitron.scrapyard;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.text.util.Linkify;
import android.view.View;
import androidx.core.view.GravityCompat;
import android.view.MenuItem;
import com.google.android.material.navigation.NavigationView;
import androidx.drawerlayout.widget.DrawerLayout;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.fragment.app.FragmentTransaction;

import android.view.Menu;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import com.dropbox.core.DbxRequestConfig;
import com.dropbox.core.android.Auth;
import com.dropbox.core.oauth.DbxCredential;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends AppCompatActivity
    implements NavigationView.OnNavigationItemSelectedListener {

    private boolean authorizingDropbox = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

        /*FloatingActionButton fab = findViewById(R.id.fab);
        fab.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                Snackbar.make(view, "Replace with your own action", Snackbar.LENGTH_LONG)
                    .setAction("Action", null).show();
            }
        });*/

        /*DrawerLayout drawer = findViewById(R.id.drawer_layout);
        NavigationView navigationView = findViewById(R.id.nav_view);
        ActionBarDrawerToggle toggle = new ActionBarDrawerToggle(
            this, drawer, toolbar, R.string.navigation_drawer_open, R.string.navigation_drawer_close);
        drawer.addDrawerListener(toggle);
        toggle.syncState();
        navigationView.setNavigationItemSelectedListener(this);*/

        TextView appDescription = findViewById(R.id.textAppDescription);
        Linkify.addLinks(appDescription, Pattern.compile("\u200BScrapyard"),
            getString(R.string.scrapyardURL),
            null, new Linkify.TransformFilter() {
                @Override
                public String transformUrl(Matcher match, String url) {
                    return "";
                }});

        EditText bookmarkPath = findViewById(R.id.editDefaultBookmarkPath);

        SharedPreferences prefs = getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE);
        bookmarkPath.setText(prefs.getString(Scrapyard.PREF_DEFAULT_BOOKMARK_FOLDER, getString(R.string.shared)));

        bookmarkPath.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                SharedPreferences.Editor editor =
                    getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE).edit();

                editor.putString(Scrapyard.PREF_DEFAULT_BOOKMARK_FOLDER, s.toString());
                editor.apply();
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });

        String dropboxToken =
            prefs.getString(Scrapyard.PREF_DROPBOX_AUTH_TOKEN, null);

        Button signInDropBox = findViewById(R.id.btnSignInDropbox);

        if (dropboxToken != null && !dropboxToken.isEmpty()) {
            signInDropBox.setText(getString(R.string.signOut));
        }
    }

    public void signInDropbox(View v) {
        Button signInDropBox = findViewById(R.id.btnSignInDropbox);

        SharedPreferences prefs = getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE);

        String dropboxToken =
            prefs.getString(Scrapyard.PREF_DROPBOX_AUTH_TOKEN, null);

        if (dropboxToken != null && !dropboxToken.isEmpty()) {
            SharedPreferences.Editor editor =
                getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE).edit();

            editor.remove(Scrapyard.PREF_DROPBOX_AUTH_TOKEN);
            editor.apply();

            signInDropBox.setText(getString(R.string.signIn));
        }
        else {
            authorizingDropbox = true;
            DbxRequestConfig reqestConfig =
                DbxRequestConfig.newBuilder("Scrapyard").build();
            Auth.startOAuth2PKCE(this, getString(R.string.dropboxAPIKey), reqestConfig);
        }
    }

    public void browseBookmarks(View v) {
        FragmentTransaction ft = getSupportFragmentManager().beginTransaction();
        ft.replace(R.id.content_frame, BrowseBookmarksFragment.newInstance());
        ft.addToBackStack("stack");
        ft.commit();
    }

    @Override
    public void onResume() {
        super.onResume();

        if (authorizingDropbox) {
            authorizingDropbox = false;

            Button signInDropBox = findViewById(R.id.btnSignInDropbox);

            DbxCredential credential = Auth.getDbxCredential();

            SharedPreferences.Editor editor =
                getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE).edit();

            if (credential != null) {
                editor.putString(Scrapyard.PREF_DROPBOX_AUTH_TOKEN, credential.toString());
                editor.apply();
                signInDropBox.setText(getString(R.string.signOut));
            } else
                signInDropBox.setText(getString(R.string.signIn));
        }
    }

    @Override
    public void onBackPressed() {
        DrawerLayout drawer = findViewById(R.id.drawer_layout);
        if (drawer.isDrawerOpen(GravityCompat.START)) {
            drawer.closeDrawer(GravityCompat.START);
        } else {
            super.onBackPressed();
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        // Inflate the menu; this adds items to the action bar if it is present.
        //getMenuInflater().inflate(R.menu.main, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        // Handle action bar item clicks here. The action bar will
        // automatically handle clicks on the Home/Up button, so long
        // as you specify a parent activity in AndroidManifest.xml.
        int id = item.getItemId();

        //noinspection SimplifiableIfStatement
        if (id == R.id.action_settings) {
            return true;
        }

        return super.onOptionsItemSelected(item);
    }

    @SuppressWarnings("StatementWithEmptyBody")
    @Override
    public boolean onNavigationItemSelected(MenuItem item) {
        // Handle navigation view item clicks here.
        int id = item.getItemId();

        if (id == R.id.nav_home) {
            // Handle the camera action
        } else if (id == R.id.nav_gallery) {

        } else if (id == R.id.nav_slideshow) {

        } else if (id == R.id.nav_tools) {

        } else if (id == R.id.nav_share) {

        } else if (id == R.id.nav_send) {

        }

        DrawerLayout drawer = findViewById(R.id.drawer_layout);
        drawer.closeDrawer(GravityCompat.START);
        return true;
    }
}
