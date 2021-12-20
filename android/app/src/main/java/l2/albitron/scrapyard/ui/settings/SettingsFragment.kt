package l2.albitron.scrapyard.ui.settings

import android.os.Bundle
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.PreferenceManager
import l2.albitron.scrapyard.R
import l2.albitron.scrapyard.Settings

class SettingsFragment : PreferenceFragmentCompat() {

    override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
        val manager: PreferenceManager = preferenceManager
        manager.sharedPreferencesName = Settings.MAIN_PREFERENCES

        setPreferencesFromResource(R.xml.root_preferences, rootKey)
    }
}