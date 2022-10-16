package l2.albitron.scrapyard.ui.providers

import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.*
import l2.albitron.scrapyard.databinding.FragmentProvidersBinding
import l2.albitron.scrapyard.R
import l2.albitron.scrapyard.Settings
import l2.albitron.scrapyard.cloud.providers.DropboxProvider
import l2.albitron.scrapyard.cloud.providers.OneDriveProvider
import l2.albitron.scrapyard.isOnline
import l2.albitron.scrapyard.showToast


class ProvidersFragment : Fragment() {
    private var _binding: FragmentProvidersBinding? = null
    private var _authorizingDropbox = false

    // This property is only valid between onCreateView and
    // onDestroyView.
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentProvidersBinding.inflate(inflater, container, false)
        val root: View = binding.root
        val activity = requireActivity()
        val settings = Settings(activity)

        //binding.fragment = this

        if (DropboxProvider.isSignedIn(activity))
            binding.signInDropboxButtonText.text = getString(R.string.sign_out)

        if (settings.isOneDriveSignedIn)
            binding.signInOnedriveButtonText.text = getString(R.string.sign_out)

        binding.signInDropboxButton.setOnClickListener { signInDropbox() }
        binding.signInOnedriveButton.setOnClickListener { signInOneDrive() }

        return root
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    fun signInDropbox() {
        val context = requireActivity()

        if (!DropboxProvider.isSignedIn(context) && !isOnline(context)) {
            showToast(R.string.no_internet)
            return
        }

        _authorizingDropbox = DropboxProvider.startSignIn(context)

        if (!_authorizingDropbox)
            binding.signInDropboxButtonText.text = getString(R.string.sign_in)
    }

    fun signInOneDrive() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            showToast(R.string.onedrive_requires_android_n, Toast.LENGTH_LONG)
            return
        }

        val context = requireActivity()

        if (isOnline(context)) {
            val settings = Settings(context)

            lifecycleScope.launch(Dispatchers.IO) {
                try {

                    // OneDriveProvider.getSignature(context)

                    if (settings.isOneDriveSignedIn)
                        OneDriveProvider.signOut(context)
                    else
                        OneDriveProvider.signIn(context)
                } catch (e: Exception) {
                    e.printStackTrace()
                    return@launch
                }

                withContext(Dispatchers.Main) {
                    settings.isOneDriveSignedIn = !settings.isOneDriveSignedIn
                    binding.signInOnedriveButtonText.text =
                        getString(if (settings.isOneDriveSignedIn) R.string.sign_out else R.string.sign_in)
                }
            }

            //OneDriveProvider.getSignature(activity)
        }
        else
            showToast(R.string.no_internet)
    }

    override fun onResume() {
        super.onResume()

        if (_authorizingDropbox) {
            _authorizingDropbox = false

            if (DropboxProvider.finishSignIn(requireActivity()))
                binding.signInDropboxButtonText.text = getString(R.string.sign_out)
            else
                binding.signInDropboxButtonText.text = getString(R.string.sign_in)
        }
    }
}
