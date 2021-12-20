package l2.albitron.scrapyard.ui.sharing

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.ForegroundInfo
import androidx.work.Worker
import androidx.work.WorkerParameters
import l2.albitron.scrapyard.*
import l2.albitron.scrapyard.cloud.providers.exceptions.CloudNotAuthorizedException
import l2.albitron.scrapyard.cloud.sharing.SharingService
import l2.albitron.scrapyard.cloud.sharing.exceptions.SharingException

private const val NOTIFICATION_ID = 42
private const val CHANNEL_ID = "notifications-scrapyard"
private const val CHANNEL_NAME = "scrapyard-sharing"

class SharingWorker(appContext: Context, workerParams: WorkerParameters): Worker(appContext, workerParams) {
    private val _context: Context = appContext

    override fun doWork(): Result {
        val notification = createSharingNotification()
        val foregroundInfo = ForegroundInfo(NOTIFICATION_ID, notification)
        setForegroundAsync(foregroundInfo)

        if (BuildConfig.DEBUG)
            printParams(inputData.keyValueMap)

        if (isOnline(_context)) {
            try {
                SharingService(_context).shareBookmark(inputData.keyValueMap)
                showToast(R.string.successfully_shared)
            } catch (e: CloudNotAuthorizedException) {
                showToast(R.string.configure_cloud_provider, Toast.LENGTH_LONG)
                redirectToProvidersFragment(_context)
            } catch (e: SharingException) {
                showToast(e.messageResource, Toast.LENGTH_LONG)
            } catch (e: Exception) {
                e.printStackTrace();
                showToast(R.string.error_accessing_cloud)
            }
        }
        else {
            showToast(R.string.no_internet, Toast.LENGTH_LONG)
        }

        return Result.success()
    }

    private fun createSharingNotification(): Notification {
        val builder = NotificationCompat.Builder(_context, _context.getString(R.string.app_name))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(_context.getString(R.string.sharing_to_scrapyard))
            .setProgress(0, 0, true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
            channel.setSound(null, null)
            with(NotificationManagerCompat.from(_context)) {
                createNotificationChannel(channel)
            }
            builder.setChannelId(CHANNEL_ID)
        }

        return builder.build()
    }

    private fun showToast(resource: Int, length: Int = Toast.LENGTH_SHORT) {
        executeInUIThread() {
            Toast.makeText(
                _context,
                _context.getString(resource),
                length
            ).show()
        }
    }

    private fun printParams(params: Map<String, Any>) {
        println("---PARAMS----------------")
        for (kv in params)
            println(kv.key + ": " + kv.value)
        println("----------------PARAMS---")
        System.out.flush()
    }
}
