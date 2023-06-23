import subprocess
import platform
import site
import sys
import os

from pathlib import Path


def check_binary(base_path, ext):
    if os.path.exists(base_path + ext):
        return base_path + ext
    return None


def get_binary_path(base_path):
    if platform.system() == "Windows":
        binaries = [
            check_binary(base_path, ".exe"),
            check_binary(base_path, ".cmd"),
            check_binary(base_path, ".bat")
        ]
    else:
        binaries = [
            check_binary(base_path, ".sh")
        ]

    return next((p for p in binaries if p is not None), base_path)


def write_manifest(template, destination, executable_path):
    with open(template, "r") as manifest_in:
        manifest_text = manifest_in.read()

        executable_manifest_path = executable_path
        if platform.system() == "Windows":
            executable_manifest_path = executable_path.replace("/", "\\")
            executable_manifest_path = executable_manifest_path.replace("\\", "\\\\")

        manifest_text = manifest_text.replace("$EXECUTABLE_PATH$", executable_manifest_path)

        Path(os.path.dirname(destination)).mkdir(parents=True, exist_ok=True)
        with open(destination, "w", encoding="utf-8") as manifest_out:
            manifest_out.write(manifest_text)


def write_reg_hklm_value(path, value):
    try:
        winreg.CreateKey(winreg.HKEY_LOCAL_MACHINE, path)
        registry_key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path, 0, winreg.KEY_WRITE)
        winreg.SetValueEx(registry_key, "", 0, winreg.REG_SZ, value)
        winreg.CloseKey(registry_key)
    except WindowsError:
        print("Can't access registry")


backend_base = "scrapyard_backend"
native_base = "scrapyard_helper"

package_path = os.path.abspath(os.path.dirname(__file__))
subprocess.check_call([sys.executable, "-m", "pip", "install", package_path, "--user"])

executable_base_path = site.getuserbase() + f"/bin/{backend_base}"

if platform.system() == "Windows":
    executable_base_path = os.path.dirname(site.getusersitepackages()) + f"\\Scripts\\{backend_base}"

executable_path = get_binary_path(executable_base_path)

firefox_manifest_path = os.path.expanduser(f"~/.mozilla/native-messaging-hosts/{native_base}.json")

if platform.system() == "Windows":
    firefox_manifest_path = executable_base_path + ".json.firefox"
elif platform.system() == "Darwin":
    firefox_manifest_path = \
        os.path.expanduser(f"~/Library/Application Support/Mozilla/NativeMessagingHosts/{native_base}.json")

write_manifest(package_path + f"/manifests/{backend_base}.json.firefox", firefox_manifest_path, executable_path)

chrome_manifest_path = os.path.expanduser(f"~/.config/google-chrome/NativeMessagingHosts/{native_base}.json")
chromium_manifest_path = chrome_manifest_path.replace("google-chrome", "chromium")

if platform.system() == "Windows":
    chrome_manifest_path = executable_base_path + ".json.chrome"
elif platform.system() == "Darwin":
    chrome_manifest_path = \
        os.path.expanduser(f"~/Library/Application Support/Google/Chrome/NativeMessagingHosts/{native_base}.json")
    chromium_manifest_path = chrome_manifest_path.replace("Chrome", "Chromium")

write_manifest(package_path + f"/manifests/{backend_base}.json.chrome", chrome_manifest_path, executable_path)

if platform.system() != "Windows":
    write_manifest(package_path + f"/manifests/{backend_base}.json.chrome", chromium_manifest_path, executable_path)

if platform.system() == "Windows":
    import winreg

    write_reg_hklm_value(f"Software\\Mozilla\\NativeMessagingHosts\\{native_base}", firefox_manifest_path)
    write_reg_hklm_value(f"Software\\Google\\Chrome\\NativeMessagingHosts\\{native_base}", chrome_manifest_path)
