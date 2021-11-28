import zipfile
import os
import re
from pathlib import Path

from flask import request, abort

from . import browser
from .server import app, requires_auth, message_mutex

# Backup routines

BACKUP_JSON_EXT = ".jsonl"
BACKUP_COMPRESSED_EXT = ".zip"


def backup_peek_meta_compressed(path):
    try:
        with zipfile.ZipFile(path, "r") as zin:
            compressed = zin.namelist()[0]
            if not compressed.endswith(BACKUP_JSON_EXT):
                return None
            with zin.open(compressed) as backup:
                meta = backup.readline()
                if meta:
                    meta = meta.decode("utf-8")
                    return meta
                else:
                    return None
    except:
        return None


def backup_peek_meta_plain(path):
    with open(path, "r", encoding="utf-8") as backup:
        return backup.readline()


def backup_peek_meta(path):
    if path.endswith(BACKUP_COMPRESSED_EXT):
        return backup_peek_meta_compressed(path)
    else:
        return backup_peek_meta_plain(path)


@app.route("/backup/list", methods=['POST'])
@requires_auth
def backup_list():
    directory = request.form["directory"]
    directory = os.path.expanduser(directory)

    if os.path.exists(directory):
        result = "{"

        files = [f for f in os.listdir(directory) if f.endswith(BACKUP_JSON_EXT) or f.endswith(BACKUP_COMPRESSED_EXT)]

        for file in files:
            path = os.path.join(directory, file)
            meta = backup_peek_meta(path)
            if meta:
                meta = meta.strip()
                meta = re.sub(r"}$", f",\"file_size\":{os.path.getsize(path)}}}", meta)
                result += f"\"{file}\": {meta},"

        result = re.sub(r",$", "", result)
        result += "}"

        return result
    else:
        return abort(404)


@app.route("/backup/initialize", methods=['POST'])
@requires_auth
def backup_initialize():
    directory = request.form["directory"]
    directory = os.path.expanduser(directory)
    backup_file_path = os.path.join(directory, request.form["file"])

    if not os.path.exists(directory):
        Path(directory).mkdir(parents=True, exist_ok=True)

    compress = request.form["compress"] == "true"

    def do_backup(backup, encode=False):
        message_mutex.acquire()
        try:
            while True:
                msg = browser.get_message()
                if msg["type"] == "BACKUP_PUSH_TEXT":
                    if encode:
                        backup.write(msg["text"].encode("utf-8"))
                    else:
                        backup.write(msg["text"])
                elif msg["type"] == "BACKUP_FINISH":
                    break
        finally:
            message_mutex.release()

    if compress:
        compressed = re.sub(f"{BACKUP_JSON_EXT}$", BACKUP_COMPRESSED_EXT, backup_file_path)
        method = {
            "DEFLATE": zipfile.ZIP_DEFLATED,
            "LZMA": zipfile.ZIP_LZMA,
            "BZIP2": zipfile.ZIP_BZIP2
        }.get(request.form["method"], zipfile.ZIP_DEFLATED)
        level = int(request.form["level"])

        try:
            zout = zipfile.ZipFile(compressed, "w", method, compresslevel=level)
            backup = zout.open(request.form["file"], "w")
            do_backup(backup, True)
        finally:
            backup.close()
            zout.close()
        return "OK"
    else:
        with open(backup_file_path, "w", encoding="utf-8") as backup:
            do_backup(backup)
        return "OK"


backup_compressed = False
backup_file = None
json_file = None


@app.route("/restore/initialize", methods=['POST'])
@requires_auth
def restore_initialize():
    directory = request.form["directory"]
    directory = os.path.expanduser(directory)
    backup_file_path = os.path.join(directory, request.form["file"])

    global backup_compressed, backup_file, json_file

    backup_compressed = backup_file_path.endswith(BACKUP_COMPRESSED_EXT)

    if backup_compressed:
        backup_file = zipfile.ZipFile(backup_file_path, 'r')
        compressed = backup_file.namelist()[0]
        json_file = backup_file.open(compressed)
    else:
        json_file = open(backup_file_path, "r", encoding="utf-8")

    return "OK"


@app.route("/restore/get_line", methods=['GET'])
@requires_auth
def restore_get_line():
    line = json_file.readline()
    if line:
        # if backup_compressed:
        #     line = line.decode("utf-8")
        # line = line.strip()
        return line
    else:
        return "", 204


@app.route("/restore/finalize", methods=['GET'])
@requires_auth
def restore_finalize():
    global backup_compressed, backup_file, json_file
    json_file.close()
    if backup_compressed:
        backup_file.close()
    backup_compressed = False
    backup_file = None
    json_file = None
    return "OK"


@app.route("/backup/delete", methods=['POST'])
@requires_auth
def backup_delete():
    directory = request.form["directory"]
    directory = os.path.expanduser(directory)
    backup_file_path = os.path.join(directory, request.form["file"])

    os.remove(backup_file_path)
    return "OK"
