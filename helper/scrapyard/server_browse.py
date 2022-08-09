import json
import logging

import flask

from . import browser
from .server import app, message_mutex, message_queue

# Browse regular scrapyard archives


@app.route("/browse/<uuid>")
def browse(uuid):
    message_mutex.acquire()
    push_blob_msg = json.dumps({"type": "REQUEST_PUSH_BLOB", "uuid": uuid})
    browser.send_message(push_blob_msg)
    msg = message_queue.get()
    message_mutex.release()

    if msg["type"] == "PUSH_BLOB":
        content = msg["content"]
        if msg["byte_length"]:
            content = content.encode("latin1")
        return flask.Response(content, mimetype=msg["content_type"])

