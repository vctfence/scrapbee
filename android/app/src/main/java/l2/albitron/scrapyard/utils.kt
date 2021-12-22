package l2.albitron.scrapyard

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import l2.albitron.scrapyard.cloud.sharing.SharingService
import java.util.concurrent.Executors

import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.widget.Toast
import androidx.fragment.app.Fragment

fun executeInThread(f: Runnable) {
    val executor = Executors.newSingleThreadExecutor()
    executor.execute(f)
}

fun executeInUIThread(f: Runnable) {
    val handler = Handler(Looper.getMainLooper())
    handler.post(f)
}

fun Fragment.showToast(resource: Int, length: Int = Toast.LENGTH_SHORT) {
    val context = requireActivity()

    Toast.makeText(
        context,
        context.getString(resource),
        length
    ).show()
}

fun Fragment.showToast(text: String, length: Int = Toast.LENGTH_SHORT) {
    Toast.makeText(
        requireActivity(),
        text,
        length
    ).show()
}

fun redirectToProvidersFragment(context: Context) {
    val activityIntent = Intent(context, MainActivity::class.java)
    activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    activityIntent.putExtra(SharingService.EXTRA_CONFIGURE_PROVIDERS, true)
    context.startActivity(activityIntent)
}

@Suppress("DEPRECATION")
fun isOnline(context: Context): Boolean {
    val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val nw = connectivityManager.activeNetwork ?: return false
        val actNw = connectivityManager.getNetworkCapabilities(nw) ?: return false
        return when {
            actNw.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> true
            actNw.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> true
            actNw.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> true
            actNw.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> true
            else -> false
        }
    } else {
        val nwInfo = connectivityManager.activeNetworkInfo ?: return false
        return nwInfo.isConnected
    }
}
