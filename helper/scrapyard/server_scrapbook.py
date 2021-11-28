import os
import threading

from pathlib import Path

import flask
from flask import request, abort

from .server import app, requires_auth


# Scrapbook RDF support

rdf_import_directory = None


@app.route("/rdf/import/<file>", methods=['POST'])
@requires_auth
def rdf_import(file):
    global rdf_import_directory
    form = request.form
    rdf_import_directory = form["rdf_directory"]
    return flask.send_from_directory(rdf_import_directory, file)


@app.route("/rdf/import/files/<path:file>", methods=['GET'])
def rdf_import_files(file):
    return flask.send_from_directory(rdf_import_directory, file)


directory_mutex = threading.Lock()
rdf_page_directories = {}


@app.route("/rdf/browse/push/<uuid>", methods=['POST'])
def rdf_browse_push(uuid):
    directory_mutex.acquire()
    rdf_page_directories[uuid] = request.form["rdf_directory"]
    directory_mutex.release()
    return "OK"


@app.route("/rdf/browse/<uuid>/<path:file>", methods=['GET'])
def rdf_browse(uuid, file):
    directory_mutex.acquire()
    rdf_directory = rdf_page_directories.get(uuid, None)
    directory_mutex.release()

    if rdf_directory is not None:
        if file == "_":
            return flask.send_from_directory(rdf_directory, f"index.html")
        else:
            return flask.send_from_directory(rdf_directory, file)
    else:
        abort(404)


# Get Scrapbook rdf file for a given node uuid

@app.route("/rdf/xml/<uuid>", methods=['POST'])
@requires_auth
def rdf_xml(uuid):
    rdf_file = request.form["rdf_file"]
    return flask.send_file(rdf_file)


# Save Scrapbook rdf file for a given node uuid

@app.route("/rdf/xml/save/<uuid>", methods=['POST'])
@requires_auth
def rdf_xml_save(uuid):
    rdf_file = request.form["rdf_file"]

    with open(rdf_file, 'w', encoding='utf-8') as fp:
        fp.write(request.form["rdf_content"])
        fp.flush()
    return "OK"


# Save Scrpabook data file

@app.route("/rdf/save_item/<uuid>", methods=['POST'])
@requires_auth
def rdf_item_save(uuid):
    rdf_item_path = request.form["rdf_directory"]
    if not os.path.exists(rdf_item_path):
        Path(rdf_item_path).mkdir(parents=True, exist_ok=True)

    with open(os.path.join(rdf_item_path, "index.html"), 'w', encoding='utf-8') as fp:
        fp.write(request.form["item_content"])
    return "OK"


# Delete Scrapbook data file

@app.route("/rdf/delete_item/<uuid>", methods=['POST'])
@requires_auth
def rdf_item_delete(uuid):
    rdf_item_path = request.form["rdf_directory"]

    def rm_tree(pth: Path):
        for child in pth.iterdir():
            if child.is_file():
                child.unlink()
            else:
                rm_tree(child)
        pth.rmdir()

    rm_tree(Path(rdf_item_path))
    return "OK"
