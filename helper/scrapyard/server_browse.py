import base64
import json
import logging
import os
import threading

import flask
from flask import request, abort

from .server import app, requires_auth

# Browse regular scrapyard archives

browse_content_map = {}
browse_mutex = threading.Lock()


@app.route("/browse/upload/<uuid>", methods=['POST'])
@requires_auth
def browse_upload(uuid):
    global browse_content_map
    content = {"blob": request.form["blob"],
               "content_type": request.form["content_type"],
               "byte_length": request.form.get("byte_length", None)}
    browse_mutex.acquire()
    browse_content_map[uuid] = content
    browse_mutex.release()
    return "OK"


@app.route("/browse/<uuid>")
def browse(uuid):
    browse_mutex.acquire()
    content = browse_content_map.get(uuid, None)
    browse_mutex.release()

    if content is not None:
        browse_mutex.acquire()
        del browse_content_map[uuid]
        browse_mutex.release()

        blob = content["blob"]

        if content["byte_length"] is not None:
            blob = base64.b64decode(blob)

        return flask.Response(blob, mimetype=content["content_type"])
    else:
        abort(404)



