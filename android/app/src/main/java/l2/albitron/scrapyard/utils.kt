package l2.albitron.scrapyard

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.fragment.app.Fragment
import l2.albitron.scrapyard.cloud.db.model.Node
import l2.albitron.scrapyard.cloud.sharing.SharingService
import java.io.File
import java.io.UnsupportedEncodingException
import java.net.URLConnection
import java.security.MessageDigest
import java.security.NoSuchAlgorithmException
import java.util.concurrent.Executors

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

private fun convertToHex(data: ByteArray): String {
    val buf = StringBuilder()

    for (b: Byte in data) {
        val i: Int = b.toInt()
        var halfbyte: Int = i ushr 4 and 0x0F
        var twoHalfs = 0
        do {
            buf.append(if (0 <= halfbyte && halfbyte <= 9) ('0'.toInt() + halfbyte).toChar() else ('a'.toInt() + (halfbyte - 10)).toChar())
            halfbyte = i and 0x0F
        } while (twoHalfs++ < 1)
    }

    return buf.toString()
}

@Throws(NoSuchAlgorithmException::class, UnsupportedEncodingException::class)
fun SHA1(text: String): String {
    val md: MessageDigest = MessageDigest.getInstance("SHA-1")
    val textBytes = text.toByteArray(charset("iso-8859-1"))
    md.update(textBytes, 0, textBytes.size)
    val sha1hash: ByteArray = md.digest()
    return convertToHex(sha1hash)
}

fun getMimetypeFromExt(name: String?): String {
    val file = File(name)
    return URLConnection.guessContentTypeFromName(file.name)
}

fun isContentNode(node: Node): Boolean {
    return node.type == Scrapyard.NODE_TYPE_BOOKMARK
        || node.type == Scrapyard.NODE_TYPE_ARCHIVE
        || node.type == Scrapyard.NODE_TYPE_NOTES
}

fun createIndex(string: String): List<String> {
    try {
        val string = string.replace("\n", " ")
                           .replace("(?:\\p{Z}|[^\\p{L}-])+".toRegex(), " ");

        val words = string.split(" ")
                          .filter {s -> s.length > 2}
                          .map {s -> s.lowercase()}

        return words
    } catch (e: Exception) {
        e.printStackTrace()
        return emptyList()
    }
}
