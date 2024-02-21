package l2.albitron.scrapyard

import android.content.Context
import android.content.Context.MODE_PRIVATE
import java.lang.ref.WeakReference

class Settings(context: Context) {
    private val _contextRef = WeakReference(context)
    private val _context: Context
        get() = _contextRef.get()!!

    var dropboxAuthToken: String?
        get() = this.getString(PREF_DROPBOX_AUTH_TOKEN)
        set(value) = this.setString(PREF_DROPBOX_AUTH_TOKEN, value)

    fun clearDropboxAuthToken() {
        removeValue(PREF_DROPBOX_AUTH_TOKEN)
    }

    val startupScreen: String
        get() = this.getString(PREF_STARTUP_SCREEN, STARTUP_SCREEN_SETTINGS)!!

    val rememberTreeState: Boolean
        get() = this.getBoolean(PREF_REMEMBER_TREE_STATE, false)

    val cloudShelfProvider: String
        get() = this.getString(PREF_CLOUD_SHELF_PROVIDER, CLOUD_PROVIDER_DROPBOX)!!

    val syncBookmarksProvider: String
        get() = this.getString(PREF_SYNC_BOOKMARKS_PROVIDER, CLOUD_PROVIDER_DROPBOX)!!

    val askForAdditionalBookmarkProperties: Boolean
        get() = this.getBoolean(PREF_ASK_ADDITIONAL_PROPERTIES, false)

    val sharedFolderName: String
        get() = this.getString(PREF_DEFAULT_BOOKMARK_FOLDER, _context.getString(R.string.default_shared_folder_name))!!

    val shareToShelf: String
        get() = this.getString(PREF_SHARE_TO_SHELF, SHARE_TO_CLOUD_SHELF)!!

    var isOneDriveSignedIn: Boolean
        get() = this.getBoolean(PREF_ONEDRIVE_SIGNED_IN, false)
        set(value) = this.setBoolean(PREF_ONEDRIVE_SIGNED_IN, value)

    private fun getString(key: String, default: String? = null): String? {
        val prefs = _context.getSharedPreferences(MAIN_PREFERENCES, MODE_PRIVATE)
        return prefs.getString(key, default)
    }

    private fun setString(key: String, value: String?) {
        val editor = _context.getSharedPreferences(MAIN_PREFERENCES, MODE_PRIVATE).edit()
        editor.putString(key, value)
        editor.apply()
    }

    private fun removeValue(key: String) {
        val editor = _context.getSharedPreferences(MAIN_PREFERENCES, MODE_PRIVATE).edit()
        editor.remove(key)
        editor.apply()
    }

    private fun getBoolean(key: String, default: Boolean = false): Boolean {
        val prefs = _context.getSharedPreferences(MAIN_PREFERENCES, MODE_PRIVATE)
        return prefs.getBoolean(key, default)
    }

    private fun setBoolean(key: String, value: Boolean) {
        val editor = _context.getSharedPreferences(MAIN_PREFERENCES, MODE_PRIVATE).edit()
        editor.putBoolean(key, value)
        editor.apply()
    }

    companion object {
        const val STARTUP_SCREEN_CLOUD = "cloud"
        const val STARTUP_SCREEN_SYNC = "sync"
        const val STARTUP_SCREEN_SETTINGS = "settings"

        const val CLOUD_PROVIDER_DROPBOX = "dropbox"
        const val CLOUD_PROVIDER_ONEDRIVE = "onedrive"

        const val SHARE_TO_CLOUD_SHELF = "cloud"
        const val SHARE_TO_SYNC_SHELF = "sync"

        const val MAIN_PREFERENCES = "ScrapyardMainPreferences"

        const val PREF_DROPBOX_AUTH_TOKEN = "PREF_DROPBOX_AUTH_TOKEN"
        const val PREF_ONEDRIVE_SIGNED_IN = "PREF_ONEDRIVE_SIGNED_IN"

        const val PREF_STARTUP_SCREEN = "PREF_STARTUP_SCREEN"
        const val PREF_REMEMBER_TREE_STATE = "PREF_REMEMBER_TREE_STATE"

        const val PREF_CLOUD_SHELF_PROVIDER = "PREF_CLOUD_SHELF_PROVIDER"
        const val PREF_SYNC_BOOKMARKS_PROVIDER = "PREF_SYNC_BOOKMARKS_PROVIDER"

        const val PREF_SHARE_TO_SHELF = "PREF_SHARE_TO_SHELF"
        const val PREF_DEFAULT_BOOKMARK_FOLDER = "PREF_DEFAULT_BOOKMARK_FOLDER"
        const val PREF_ASK_ADDITIONAL_PROPERTIES = "PREF_ASK_ADDITIONAL_PROPERTIES"
    }
}
