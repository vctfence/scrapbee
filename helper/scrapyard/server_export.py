import tempfile
import os

import flask

from . import browser
from .server import app, requires_auth, message_mutex, message_queue

# Export using helper

export_file = None


@app.route("/export/initialize", methods=['GET'])
@requires_auth
def export_initialize():
    global export_file
    export_file = os.path.join(tempfile.gettempdir(), next(tempfile._get_candidate_names()))

    with open(export_file, mode="w", encoding="utf-8") as fp:
        message_mutex.acquire()
        try:
            while True:
                text = message_queue.get()
                if text is not None:
                    fp.write(text)
                else:
                    fp.flush()
                    break
        finally:
            message_mutex.release()

    return "", 204

@app.route("/export/download", methods=['GET'])
def export_download():
    return flask.send_file(export_file, mimetype="application/json")


@app.route("/export/finalize", methods=['GET'])
@requires_auth
def export_finalize():
    global export_file
    os.remove(export_file)
    export_file = None
    return "", 204
