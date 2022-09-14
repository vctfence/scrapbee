import json
import base64
import logging

import flask
from flask import abort, send_file

from . import browser
from .server import app, message_mutex, message_queue
from .storage_manager import StorageManager

# Browse regular scrapyard archives

storage_manager = StorageManager()


@app.route("/browse/<uuid>")
def browse(uuid):
    message_mutex.acquire()
    msg = json.dumps({"type": "REQUEST_ARCHIVE", "uuid": uuid})
    browser.send_message(msg)
    msg = message_queue.get()
    message_mutex.release()

    if msg["type"] == "ARCHIVE_INFO" and msg["kind"] == "data_path" and msg["data_path"]:
        return serve_from_file(msg, uuid)
    elif msg["type"] == "ARCHIVE_INFO" and msg["kind"] == "content":
        return serve_content(msg, uuid)

    return "", 404


def serve_from_file(params, uuid):
    params["uuid"] = uuid

    object_directory = storage_manager.get_object_directory(params, uuid)
    archive_content_path = storage_manager.get_archive_content_path(object_directory)
    archive_metadata = storage_manager.fetch_archive_metadata(params)

    if archive_metadata:
        return send_file(archive_content_path, mimetype=archive_metadata["content_type"])
    else:
        return abort(404)


def serve_content(params, uuid):
    content = params["content"]

    if params["byte_length"]:
        content = content.encode("latin1")

    return flask.Response(content, mimetype=params["content_type"])
