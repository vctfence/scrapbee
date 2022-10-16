import json
import traceback
import threading
import logging
import socket
import queue
import time
import os
from functools import wraps
from contextlib import closing

import flask
from flask import request, abort, render_template
from werkzeug.serving import make_server
# from werkzeug.middleware.profiler import ProfilerMiddleware

from .server_debug import DEBUG
from .storage_manager import StorageManager

app = flask.Flask(__name__, template_folder="resources", static_folder="resources")
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

log = logging.getLogger('werkzeug')
log.disabled = True
app.logger.disabled = not DEBUG

###
if DEBUG:
    logging.basicConfig(filename="../.local/helper.log", encoding="utf-8", level=logging.DEBUG)
    # profiler_log_file = open("../.local/profiler.log", "w", encoding="utf-8")
    # app.wsgi_app = ProfilerMiddleware(app.wsgi_app, profiler_log_file)
###

auth_token = None
host = "localhost"
port = None
httpd = None

message_mutex = threading.Lock()
message_queue = queue.Queue()

storage_manager = StorageManager()


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


def start(a_port, an_auth):
    global httpd
    global port
    global auth_token
    port = a_port
    auth_token = an_auth

    if not wait_for_port(port):
        return False

    httpd = Httpd(app, a_port)
    httpd.start()

    return True


def stop():
    global httpd
    httpd.shutdown()


def port_available(port):
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
        sock.settimeout(0.1)
        result = sock.connect_ex(("127.0.0.1", port))
        if result == 0:
            return False
        else:
            return True


def wait_for_port(port):
    ctr = 20

    while ctr > 0:
        if port_available(port):
            return True
        ctr -= 1
        time.sleep(0.1)

    return False


def requires_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not request.authorization or request.authorization["password"] != auth_token:
            return abort(401)
        return f(*args, **kwargs)
    return decorated


###
#if DEBUG:
if True:
    @app.errorhandler(500)
    def handle_500(e=None):
        return f"<pre>{traceback.format_exc()}</pre>", 500
###


@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
    return r


def send_native_message(msg):
    message_mutex.acquire()
    response = {}

    try:
        msg_json = json.dumps(msg)
        browser.send_message(msg_json)
        response = message_queue.get()
    finally:
        message_mutex.release()

    return response



from . import browser
from . import server_resources
from . import server_rdf
from . import server_browse
from . import server_export
from . import server_backup
from . import server_upload
from . import server_storage


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
