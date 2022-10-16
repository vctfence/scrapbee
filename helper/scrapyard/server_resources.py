import os

from flask import send_file

from .server import app, requires_auth


@app.route("/resources/js/mark.js", methods=['GET'])
def serve_mark():
    package_dir = os.path.split(__file__)[0]
    mark_js_path = os.path.join(package_dir, "resources", "js", "mark.js")

    return send_file(mark_js_path)


@app.route("/resources/js/jquery.js", methods=['GET'])
def serve_jquery():
    package_dir = os.path.split(__file__)[0]
    jquery_js_path = os.path.join(package_dir, "resources", "js", "jquery.js")

    return send_file(jquery_js_path)
