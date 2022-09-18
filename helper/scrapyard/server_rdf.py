import logging
import os
import shutil

from pathlib import Path

import flask
from flask import request

from .cache_dict import CacheDict
from .import_rdf import import_rdf_archive
from .server import app, requires_auth, send_native_message

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


def _copyfileobj_patched(fsrc, fdst, length=16*1024*1024):
    """Patches shutil method to hugely improve copy speed"""
    while 1:
        buf = fsrc.read(length)
        if not buf:
            break
        fdst.write(buf)


shutil.copyfileobj = _copyfileobj_patched


@app.route("/rdf/import/archive", methods=['POST'])
@requires_auth
def rdf_import_archive():
    return import_rdf_archive(request.json)


rdf_page_directories = CacheDict()


@app.route("/rdf/browse/<uuid>/", methods=['GET'])
def rdf_browse(uuid):
    msg = send_native_message({"type": "REQUEST_RDF_PATH", "uuid": uuid})
    rdf_page_directories[uuid] = msg["rdf_directory"]
    return flask.send_from_directory(rdf_page_directories[uuid], "index.html")


@app.route("/rdf/browse/<uuid>/<path:file>", methods=['GET'])
def rdf_browse_content(uuid, file):
    return flask.send_from_directory(rdf_page_directories[uuid], file)


# Get Scrapbook rdf file for the given node uuid

@app.route("/rdf/xml/<uuid>", methods=['POST'])
@requires_auth
def rdf_xml(uuid):
    rdf_file = request.form["rdf_file"]
    return flask.send_file(rdf_file)


# Save Scrapbook rdf file for the given node uuid

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
