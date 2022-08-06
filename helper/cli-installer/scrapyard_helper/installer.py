import subprocess
import platform
import site
import sys
import os

from pathlib import Path

package = os.path.abspath(os.path.dirname(__file__))
subprocess.check_call([sys.executable, "-m", "pip", "install", package, "--user"])

executable_path = site.getuserbase() + "/bin/scrapyard_helper"


def write_manifest(template, destination):
    with open(template, "r") as manifest_in:
        manifest_text = manifest_in.read()
        manifest_text = manifest_text.replace("$EXECUTABLE_PATH$", executable_path)

        Path(os.path.dirname(destination)).mkdir(parents=True, exist_ok=True)
        with open(destination, "w") as manifest_out:
            manifest_out.write(manifest_text)


firefox_manifest_path = os.path.expanduser("~/.mozilla/native-messaging-hosts/scrapyard_helper.json")

if platform.system() == "Darwin":
    firefox_manifest_path = \
        os.path.expanduser("~/Library/Application Support/Mozilla/NativeMessagingHosts/scrapyard_helper.json")

write_manifest(package + "/manifests/scrapyard_helper.json.firefox", firefox_manifest_path)

chrome_manifest_path = os.path.expanduser("~/.config/google-chrome/NativeMessagingHosts/scrapyard_helper.json")
chromium_manifest_path = chrome_manifest_path.replace("google-chrome", "chromium")

if platform.system() == "Darwin":
    chrome_manifest_path = \
        os.path.expanduser("~/Library/Application Support/Google/Chrome/NativeMessagingHosts/scrapyard_helper.json")
    chromium_manifest_path = chrome_manifest_path.replace("Chrome", "Chromium")

write_manifest(package + "/manifests/scrapyard_helper.json.chrome", chrome_manifest_path)
write_manifest(package + "/manifests/scrapyard_helper.json.chrome", chromium_manifest_path)
