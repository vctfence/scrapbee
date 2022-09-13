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
    msg = json.dumps({"type": "REQUEST_DATA_PATH"})
    browser.send_message(msg)
    msg = message_queue.get()
    message_mutex.release()

    if msg["type"] == "DATA_PATH":
        params = msg
        params["uuid"] = uuid

        object_directory = storage_manager.get_object_directory(params, uuid)
        archive_content_path = storage_manager.get_archive_content_path(object_directory)
        archive_metadata = storage_manager.fetch_archive_metadata(params)

        if archive_metadata:
            return send_file(archive_content_path, mimetype=archive_metadata["content_type"])
        else:
            return abort(404)


# def browse_v1(uuid):
#     message_mutex.acquire()
#     push_blob_msg = json.dumps({"type": "REQUEST_PUSH_BLOB", "uuid": uuid})
#     browser.send_message(push_blob_msg)
#     msg = message_queue.get()
#     message_mutex.release()
#
#     if msg["type"] == "PUSH_BLOB":
#         content = msg["content"]
#         if msg["byte_length"]:
#             content = content.encode("latin1")
#         return flask.Response(content, mimetype=msg["content_type"])
