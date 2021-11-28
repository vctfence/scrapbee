from flask import request, jsonify
from .server import app, requires_auth

from .server_sync_db import *


@app.route("/sync/check_directory", methods=['POST'])
@requires_auth
def sync_check_directory():
    sync_directory = request.form["sync_directory"]
    status = "populated"

    if init_sync_db(sync_directory):
        status = "empty"

    return jsonify(status=status)


@app.route("/sync/get_metadata", methods=['POST'])
@requires_auth
def sync_describe():
    result = get_sync_properties(request.form["sync_directory"])
    return jsonify(result)


@app.route("/sync/compute", methods=['POST'])
@requires_auth
def sync_compute():
    result = compute_sync(request.form)
    return jsonify(result)


@app.route("/sync/open_session", methods=['POST'])
@requires_auth
def sync_open_session():
    form = request.form
    open_sync_session(form["sync_directory"])
    return "OK"


@app.route("/sync/close_session", methods=['GET'])
@requires_auth
def sync_close_session():
    close_sync_session()
    return "OK"


@app.route("/sync/delete", methods=['POST'])
@requires_auth
def sync_delete():
    delete_nodes_in_db(json.loads(request.form["nodes"]))
    return "OK"


@app.route("/sync/push_node", methods=['POST'])
@requires_auth
def sync_push_node():
    push_sync_objects(request.form)
    return "OK"


@app.route("/sync/pull_node", methods=['POST'])
@requires_auth
def sync_pull_node():
    return jsonify(pull_sync_objects(request.form))


@app.route("/sync/reset", methods=['POST'])
@requires_auth
def sync_reset():
    reset_sync_db(request.form["sync_directory"])
    return "OK"
