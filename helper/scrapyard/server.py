import traceback
import threading
import logging
import socket
import time
import os
from functools import wraps
from contextlib import closing

import flask
from flask import request, abort, render_template, send_file
from werkzeug.serving import make_server

from .storage_manager import StorageManager
from .utils import module_property

app = flask.Flask(__name__, template_folder="resources", static_folder="resources")
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

accessLog = logging.getLogger('werkzeug')
accessLog.disabled = True

helper_log_file = None

auth_token = None
host = "localhost"
port = None
httpd = None

storage_manager = None


@module_property
def _storage_manager():
    return storage_manager


class Httpd(threading.Thread):
    def __init__(self, app, port):
        threading.Thread.__init__(self, daemon=True)
        self.srv = make_server(host, port, app, True)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        self.srv.serve_forever()

    def shutdown(self):
        self.srv.shutdown()


def start(options):
    global httpd
    global port
    global auth_token
    global storage_manager

    port = options["port"]
    auth_token = options["auth"]

    storage_manager = StorageManager(port)
    storage_manager.clean_temp_directory()

    logging_enabled = options.get("logging", False)
    app.logger.disabled = not logging_enabled
    if logging_enabled:
        enable_logging()
    # enable_profiling()

    if not wait_for_port(port):
        logging.error(f"Server port {port} is not available.")
        return False

    httpd = Httpd(app, port)
    httpd.start()

    logging.info("Server initialized.")

    return True


def stop():
    global httpd
    httpd.shutdown()


def wait_for_port(port):
    ctr = 20

    while ctr > 0:
        if port_available(port):
            return True
        ctr -= 1
        time.sleep(0.1)

    return False


def port_available(port):
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.settimeout(0.1)
        result = sock.connect_ex(("127.0.0.1", port))
        if result == 0:
            return False
        else:
            return True


def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not request.authorization or request.authorization["password"] != auth_token:
            return abort(401)
        return f(*args, **kwargs)
    return decorated


def enable_logging():
    global helper_log_file

    helper_log_file = os.path.join(storage_manager.get_temp_directory(), "helper.log")
    logging.basicConfig(filename=helper_log_file, encoding="utf-8", level=logging.DEBUG,
                        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")


def enable_profiling():
    from werkzeug.middleware.profiler import ProfilerMiddleware

    profiler_log_file = os.path.join(storage_manager.get_temp_directory(), "profiler.log")
    profiler_log_file = open(profiler_log_file, "w", encoding="utf-8")
    app.wsgi_app = ProfilerMiddleware(app.wsgi_app, profiler_log_file)


from . import browser
from . import server_resources
from . import server_rdf
from . import server_browse
from . import server_export
from . import server_backup
from . import server_upload
from . import server_storage


@app.errorhandler(500)
def handle_500(e=None):
    return f"<pre>{traceback.format_exc()}</pre>", 500


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


@app.errorhandler(404)
def page_not_found(e):
    return render_template("404.html"), 404


@app.route("/exit")
@requires_auth
def exit_app():
    os._exit(0)


@app.route("/helper_log")
def helper_log():
    if app.logger.disabled:
        return "", 404
    else:
        return send_file(helper_log_file, mimetype="text/plain")
