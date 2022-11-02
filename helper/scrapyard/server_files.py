import logging
import os

import flask
from flask import request

from .server import requires_auth, app
from .storage_files import files_list_directory, files_open_with_editor, files_fetch_file_content, \
    files_save_file_content, files_shell_open_asset, files_create_index


@app.route("/files/list_directory", methods=['POST'])
@requires_auth
def list_directory():
    return files_list_directory(request.json)


@app.route("/files/open_with_editor", methods=['POST'])
@requires_auth
def open_with_editor():
    files_open_with_editor(request.json)
    return "", 204


@app.route("/files/shell_open_asset", methods=['POST'])
@requires_auth
def shell_open_asset():
    files_shell_open_asset(request.json)
    return "", 204


@app.route("/files/fetch_file_content", methods=['POST'])
@requires_auth
def fetch_file_content():
    content = files_fetch_file_content(request.json)

    if content:
        return content
    else:
        return "", 404


@app.route("/files/save_file_content", methods=['POST'])
@requires_auth
def save_file_content():
    files_save_file_content(request.json)
    return "", 204


@app.route("/files/create_index", methods=['POST'])
@requires_auth
def create_index():
    content = files_create_index(request.json)

    if content:
        return content
    else:
        return "", 404
