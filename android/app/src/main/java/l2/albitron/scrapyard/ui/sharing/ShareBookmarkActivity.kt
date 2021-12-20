package l2.albitron.scrapyard.ui.sharing

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import l2.albitron.scrapyard.R
import l2.albitron.scrapyard.Settings
import l2.albitron.scrapyard.cloud.sharing.SharingService

class ShareBookmarkActivity : AppCompatActivity() {
    private val _settings = Settings(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (_settings.askForAdditionalBookmarkProperties) {
            setTheme(R.style.Theme_UserDialog)
            setContentView(R.layout.activity_share_bookmark)
            setFinishOnTouchOutside(false)

            val params = getBookmarkData(intent).keyValueMap
            val title = SharingService(this).getBookmarkProperties(params).component1()
            val bookmarkTitle = findViewById<EditText>(R.id.bookmarkTitle)
            bookmarkTitle.setText(title)

            val btnCancel = findViewById<Button>(R.id.btnCancel)
            btnCancel.setOnClickListener { _: View? -> finish() }

            val btnOK = findViewById<Button>(R.id.btnOk)
            btnOK.setOnClickListener { _: View? ->
                setAdditionalProperties(intent)
                shareBookmark(intent)
            }
        }
        else {
            moveTaskToBack(true)
            shareBookmark(intent)
        }
    }

    private fun shareBookmark(intent: Intent) {
        if (Intent.ACTION_SEND == intent.action && intent.type != null) {
            val sharingWorkRequest = OneTimeWorkRequestBuilder<SharingWorker>()
                .setInputData(getBookmarkData(intent))
                .build()

            WorkManager
                .getInstance(this)
                .enqueue(sharingWorkRequest)
        }

        finish()
    }

    private fun getBookmarkData(intent: Intent): Data {
        val dataBuilder = Data.Builder()
        val extras = intent.extras
        extras?.keySet()?.forEach {
            val v = extras.get(it)
            if (v is String)
                dataBuilder.putString(it, v)
        }
        dataBuilder.putString(SharingService.EXTRA_CONTENT_TYPE, intent.type)
        dataBuilder.putString(SharingService.EXTRA_REFERRER, ActivityCompat.getReferrer(this)?.host)
        return dataBuilder.build()
    }

    private fun setAdditionalProperties(intent: Intent) {
        val extras = intent.extras

        val bookmarkTitle = findViewById<EditText>(R.id.bookmarkTitle)
        val title = bookmarkTitle.text.toString()
        if (title.isNotBlank()) {
            extras?.putString(Intent.EXTRA_TITLE, null)
            extras?.putString(Intent.EXTRA_SUBJECT, title.trim())
        }

        val todoState = findViewById<Spinner>(R.id.todoState)
        val state = todoState.selectedItem.toString()
        extras?.putString(SharingService.EXTRA_TODO_STATE, state)

        val todoDetails = findViewById<EditText>(R.id.todoDetails)
        extras?.putString(SharingService.EXTRA_TODO_DETAILS, todoDetails.text.toString())

        intent.replaceExtras(extras)
    }
}