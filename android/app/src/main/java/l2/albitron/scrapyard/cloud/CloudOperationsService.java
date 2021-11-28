package l2.albitron.scrapyard.cloud;

import android.app.IntentService;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import android.widget.Toast;

import java.util.Random;

import l2.albitron.scrapyard.MainActivity;
import l2.albitron.scrapyard.R;
import l2.albitron.scrapyard.Scrapyard;
import l2.albitron.scrapyard.cloud.exceptions.CloudNotAuthorizedException;

public class CloudOperationsService extends IntentService {
    private static Random random = new Random();

    private static final String ACTION_SHARE = "l2.albitron.scrapyard.cloud.action.SHARE";

    public static final String EXTRA_REFERRER = "l2.albitron.scrapyard.cloud.extra.REFERRER";
    public static final String EXTRA_CONTENT_TYPE = "l2.albitron.scrapyard.cloud.extra.CONTENT_TYPE";
    public static final String EXTRA_EXTRAS = "l2.albitron.scrapyard.cloud.extra.EXTRAS";

    final static int NOTIFICATION_ID = 42;
    final static String CHANNEL_ID = "notifications-scrapyard";

    public CloudOperationsService() {
        super("CloudOperationsService");
        setIntentRedelivery(true);
    }

    public static void startCloudSharing(Context context, String referrer, String content_type, Bundle extras) {
        Intent intent = new Intent(context, CloudOperationsService.class);
        intent.setAction(ACTION_SHARE);
        intent.putExtra(EXTRA_REFERRER, referrer);
        intent.putExtra(EXTRA_CONTENT_TYPE, content_type);
        intent.putExtra(EXTRA_EXTRAS, extras);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    protected void onHandleIntent(Intent intent) {
        if (intent != null) {
            final String action = intent.getAction();
            if (ACTION_SHARE.equals(action)) {
                NotificationManager notificationManager =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

                Notification notification = createSharingNotification(getApplicationContext());

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    startForeground(NOTIFICATION_ID, notification);
                else
                    notificationManager.notify(NOTIFICATION_ID, notification);

                try {
                    final String referrer = intent.getStringExtra(EXTRA_REFERRER);
                    final String content_type = intent.getStringExtra(EXTRA_CONTENT_TYPE);
                    final Bundle extras = (Bundle) intent.getExtras().get(EXTRA_EXTRAS);
                    handleCloudSharing(referrer, content_type, extras);
                }
                finally {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                        stopForeground(true);
                    else {
                        notificationManager.cancel(NOTIFICATION_ID);
                    }
                }
            }
        }
    }

    private void handleCloudSharing(String referrer, String content_type, Bundle extras) {
        try {
            CloudBackend backend = new CloudBackend(this);

            SharedPreferences prefs = getSharedPreferences(Scrapyard.MAIN_PREFERENCES, MODE_PRIVATE);
            String path = prefs.getString(Scrapyard.PREF_DEFAULT_BOOKMARK_FOLDER, getString(R.string.shared));

            backend.shareBookmark(path, referrer, content_type, extras);

            Handler handler = new Handler(Looper.getMainLooper());
            handler.post(() -> Toast.makeText(getApplicationContext(),
                                    getString(R.string.successfullyShared),
                                    Toast.LENGTH_SHORT).show());

        } catch (CloudNotAuthorizedException e) {

            Handler handler = new Handler(Looper.getMainLooper());
            handler.post(() -> {
                    Toast.makeText(getApplicationContext(),
                        getString(R.string.needToConfigureCloudProvider),
                        Toast.LENGTH_LONG).show();

                    Intent activityIntent = new Intent(CloudOperationsService.this, MainActivity.class);
                    activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(activityIntent);
                });

        } catch (Exception e) {
            e.printStackTrace();

            Handler handler = new Handler(Looper.getMainLooper());
            handler.post(() -> Toast.makeText(getApplicationContext(),
                getString(R.string.errorAccessingCloud),
                Toast.LENGTH_SHORT).show());
        }
    }

    protected static Notification createSharingNotification(Context context) {
        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(context, Scrapyard.APP_NAME)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(context.getString(R.string.sharingToScrapyard))
                .setProgress(0, 0, true);

        NotificationManager notificationManager =
            (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,"scrapyard-sharing",
                NotificationManager.IMPORTANCE_LOW);
            channel.setSound(null, null);
            notificationManager.createNotificationChannel(channel);
            builder.setChannelId(CHANNEL_ID);
        }

        return builder.build();
    }
}
