import tempfile
import os

import flask

from . import browser
from .server import app, requires_auth, message_mutex


# Export using helper

export_file = None


@app.route("/export/initialize", methods=['GET'])
@requires_auth
def export_initialize():
    global export_file
    export_file = os.path.join(tempfile.gettempdir(), next(tempfile._get_candidate_names()))

    message_mutex.acquire()
    try:
        with open(export_file, mode="w", encoding="utf-8") as fp:
            while True:
                msg = browser.get_message()
                if msg["type"] == "EXPORT_PUSH_TEXT":
                    fp.write(msg["text"])
                elif msg["type"] == "EXPORT_FINISH":
                    fp.flush()
                    break
    finally:
        message_mutex.release()

    return "OK"

@app.route("/export/download", methods=['GET'])
def export_download():
    return flask.send_file(export_file)


@app.route("/export/finalize", methods=['GET'])
@requires_auth
def export_finalize():
    global export_file
    os.remove(export_file)
    export_file = None
    return "OK"
