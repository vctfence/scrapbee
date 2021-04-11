package l2.albitron.scrapyard;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.core.app.ActivityCompat;
import android.os.Bundle;

import java.util.Set;

import l2.albitron.scrapyard.cloud.CloudOperationsService;

public class CloudBookmarkActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        moveTaskToBack(true);

        Intent intent = getIntent();
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            Uri referrerUri = ActivityCompat.getReferrer(this);
            String referrer = referrerUri != null? referrerUri.getHost(): "";
            Bundle extras = intent.getExtras();

            if (extras != null) {
                if (BuildConfig.DEBUG) {
                    System.out.println("---INTENT----------------");
                    System.out.println(type);
                    System.out.println(referrer);
                    Set<String> keys = extras.keySet();

                    for (String k : keys) {
                        System.out.println(k);
                        System.out.println(extras.get(k));
                    }

                    System.out.println("----------------INTENT---");
                    System.out.flush();
                }

                CloudOperationsService.startCloudSharing(this, referrer, type, extras);
            }
        }

        this.finish();
    }
}
