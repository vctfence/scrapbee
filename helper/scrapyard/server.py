import traceback
import threading
import tempfile
import logging
import json
import os
from functools import wraps
from pathlib import Path

import flask
from flask import Response, Request, request, abort
from werkzeug.serving import make_server

from . import browser

app = flask.Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
log = logging.getLogger('werkzeug')
log.disabled = True
app.logger.disabled = True
#logging.basicConfig(filename='debug.log', encoding='utf-8', level=logging.DEBUG)

auth = None
host = "localhost"
port = None
httpd = None

class Httpd(threading.Thread):

    def __init__(self, app, port):
        threading.Thread.__init__(self)
        self.srv = make_server(host, port, app)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        self.srv.serve_forever()

    def shutdown(self):
        self.srv.shutdown()


def start(a_port, an_auth):
    global httpd
    global port
    global auth
    port = a_port
    auth = an_auth
    httpd = Httpd(app, a_port)
    #httpd.setDaemon(True)
    httpd.start()


def stop():
    global httpd
    httpd.shutdown()


def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = True #request.authorization
        if not auth:
            abort(401)
        return f(*args, **kwargs)
    return decorated


# @app.errorhandler(Exception)
# def handle_500(e=None):
#     return traceback.format_exc(), 500

@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
    return r


@app.route("/")
def root():
    return "Scrapyard helper application"

# Browse regular scrapyard archives

@app.route("/browse/<uuid>")
def browse(uuid):
    browser.send_message(json.dumps({"type": "REQUEST_PUSH_BLOB", "uuid": uuid}))
    msg = browser.get_message()
    if msg["type"] == "PUSH_BLOB":
        blob = msg["blob"]
        if msg["byte_length"]:
            blob = blob.encode("latin1")
        return flask.Response(blob, mimetype=msg["content_type"])


# Scrapbook RDF support

rdf_import_directory = None


@app.route("/rdf/import/<file>", methods=['POST'])
def rdf_import(file):
    global rdf_import_directory
    form = request.form
    rdf_import_directory = form["rdf_directory"]
    return flask.send_from_directory(rdf_import_directory, file)


@app.route("/rdf/import/files/<path:file>", methods=['GET'])
def rdf_import_files(file):
    return flask.send_from_directory(rdf_import_directory, file)


rdf_browse_directories = dict()


@app.route("/rdf/browse/<uuid>/<path:file>", methods=['GET'])
def rdf_browse(uuid, file):
    if file == "_":
        browser.send_message(json.dumps({"type": "REQUEST_RDF_PATH", "uuid": uuid}))
        msg = browser.get_message()
        rdf_browse_directories[uuid] = msg["rdf_directory"]
        if msg["type"] == "RDF_PATH" and msg["uuid"] == uuid:
            return flask.send_from_directory(rdf_browse_directories[uuid], f"index.html")
        else:
            abort(404)
    else:
        return flask.send_from_directory(rdf_browse_directories[uuid], file)


# Get Scrapbook rdf file for a given node uuid

@app.route("/rdf/root/<uuid>", methods=['GET'])
def rdf_root(uuid):
    browser.send_message(json.dumps({"type": "REQUEST_RDF_ROOT", "uuid": uuid}))
    msg = browser.get_message()
    if msg["type"] == "RDF_ROOT" and msg["uuid"] == uuid:
        return flask.send_file(msg["rdf_file"])


# Save Scrapbook rdf file for a given node uuid

@app.route("/rdf/root/save/<uuid>", methods=['POST'])
def rdf_root_save(uuid):
    browser.send_message(json.dumps({"type": "REQUEST_RDF_ROOT", "uuid": uuid}))
    msg = browser.get_message()
    if msg["type"] == "RDF_ROOT" and msg["uuid"] == uuid:
        with open(msg["rdf_file"], 'w', encoding='utf-8') as fp:
            fp.write(request.form["rdf_content"])
            fp.flush()
    return "OK"


# Save Scrpabook data file

@app.route("/rdf/save_item/<uuid>", methods=['POST'])
def rdf_item_save(uuid):
    browser.send_message(json.dumps({"type": "REQUEST_RDF_PATH", "uuid": uuid}))
    msg = browser.get_message()
    rdf_item_path = msg["rdf_directory"]
    Path(rdf_item_path).mkdir(parents=True, exist_ok=True)
    if msg["type"] == "RDF_PATH" and msg["uuid"] == uuid:
        with open(os.path.join(rdf_item_path, "index.html"), 'w', encoding='utf-8') as fp:
            fp.write(request.form["item_content"])
    return "OK"


# Delete Scrapbook data file

@app.route("/rdf/delete_item/<uuid>", methods=['GET'])
def rdf_item_delete(uuid):
    browser.send_message(json.dumps({"type": "REQUEST_RDF_PATH", "uuid": uuid}))
    msg = browser.get_message()
    rdf_item_path = msg["rdf_directory"]

    def rm_tree(pth: Path):
        for child in pth.iterdir():
            if child.is_file():
                child.unlink()
            else:
                rm_tree(child)
        pth.rmdir()

    if msg["type"] == "RDF_PATH" and msg["uuid"] == uuid:
        rm_tree(Path(rdf_item_path))
    return "OK"


# Export support

export_file = None


@app.route("/export/initialize", methods=['GET'])
def export_initialize():
    global export_file
    export_file = os.path.join(tempfile.gettempdir(), next(tempfile._get_candidate_names()))
    with open(export_file, mode="w", encoding="utf-8") as fp:
        while True:
            msg = browser.get_message()
            if msg["type"] == "EXPORT_PUSH_TEXT":
                fp.write(msg["text"])
            elif msg["type"] == "EXPORT_FINISH":
                fp.flush()
                return "OK"


@app.route("/export/download", methods=['GET'])
def export_download():
    return flask.send_file(export_file)


@app.route("/export/finalize", methods=['GET'])
def export_finalize():
    os.remove(export_file)
    return "OK"
