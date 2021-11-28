import configparser
import platform
import os

from flask import abort

from .server import app, requires_auth


# Utility routines

# Find IDB path on the current Firefox profile

def find_db_path(mozilla_root, profiles, addon_id):
    profiles = [profiles[k] for k in profiles.keys() if k.startswith("Profile")]

    for profile in profiles:
        path = profile["Path"]

        if profile["IsRelative"] == "1":
            path = mozilla_root + path

        path_candidate = f"{path}/storage/default/moz-extension+++{addon_id}"

        if os.path.exists(path_candidate):
            return path_candidate.replace("/", "\\")

    return None


# try to get the Scrapyard addon database path
@app.route("/request/idb_path/<addon_id>")
@requires_auth
def get_db_path(addon_id):
    mozilla_root = ""

    if platform.system() == "Windows":
        mozilla_root = os.environ["APPDATA"] + "/Mozilla/Firefox/"
    elif platform.system() == "Linux":
        mozilla_root = os.path.expanduser("~/.mozilla/firefox/")
    elif platform.system() == "Darwin":
        mozilla_root = os.path.expanduser("~/Library/Application Support/Firefox/")
    else:
        return abort(404)

    profiles_ini = f"{mozilla_root}profiles.ini"

    if os.path.exists(profiles_ini):
        config = configparser.ConfigParser()
        config.read(profiles_ini)
        path = find_db_path(mozilla_root, config, addon_id)
        if path:
            return path
        else:
            return abort(404)
    else:
        return abort(404)
