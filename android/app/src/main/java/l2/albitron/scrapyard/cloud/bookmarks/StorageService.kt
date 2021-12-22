package l2.albitron.scrapyard.cloud.bookmarks

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.annotation.RequiresApi
import java.io.File
import java.io.FileOutputStream
import java.lang.Exception

class StorageService(context: Context) {
    var _context = context

    private fun openIntent(uri: Uri?, type: String) {
        println(type)
        try {
            val intent = Intent(Intent.ACTION_VIEW)
            intent.flags = Intent.FLAG_ACTIVITY_NO_HISTORY
            intent.setDataAndType(uri, type)
            _context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun writeToDiskAndOpen(bytes: ByteArray?, name: String, type: String): Boolean {
        try {
            val mimeTypeMap = MimeTypeMap.getSingleton()
            val extension = mimeTypeMap.getExtensionFromMimeType(type)
            val fileName = if (name.endsWith(extension!!)) name else "$name.$extension"
            var uri: Uri? =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                    saveForAndroidQAndLatter(bytes, fileName, type)
                else
                    saveForAndroidLessThanQ(bytes, fileName)
            openIntent(uri, type)
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return false
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun saveForAndroidQAndLatter(bytes: ByteArray?, fileName: String, type: String): Uri? {
        var values = ContentValues()
        values.put(MediaStore.Files.FileColumns.DISPLAY_NAME, fileName)
        values.put(MediaStore.Files.FileColumns.MIME_TYPE, type)
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download")
        values.put(MediaStore.MediaColumns.IS_PENDING, true)

        val resolver = _context.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)

        try {
            resolver.openOutputStream(uri!!).use { output ->
                output!!.write(bytes)
                output.flush()
            }
        }
        finally {
            values = ContentValues()
            values.put(MediaStore.Images.ImageColumns.IS_PENDING, false)
            resolver.update(uri!!, values, null, null)
        }

        return uri
    }

    @Suppress("DEPRECATION")
    private fun saveForAndroidLessThanQ(bytes: ByteArray?, fileName: String): Uri? {
        val directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        val file = File(directory, fileName)
        val uri = Uri.fromFile(file)

        file.parentFile?.mkdirs()

        if (!file.exists()) {
            file.createNewFile()
            FileOutputStream(file).use { fos ->
                fos.write(bytes)
                fos.flush()
            }
        }

        return uri
    }
}
