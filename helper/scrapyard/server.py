import traceback
import threading
import logging
import os
from functools import wraps

import flask
from flask import request, abort
from werkzeug.serving import make_server

DEBUG = False

app = flask.Flask(__name__)
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
log = logging.getLogger('werkzeug')
log.disabled = True
app.logger.disabled = not DEBUG

###
if DEBUG:
    logging.basicConfig(filename='../.local/helper.log', encoding='utf-8', level=logging.DEBUG)
###

auth_token = None
host = "localhost"
port = None
httpd = None

message_mutex = threading.Lock()

class Httpd(threading.Thread):

    def __init__(self, app, port):
        threading.Thread.__init__(self)
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
    httpd = Httpd(app, a_port)
    #httpd.setDaemon(True)
    httpd.start()


def stop():
    global httpd
    httpd.shutdown()


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
    @app.errorhandler(Exception)
    def handle_500(e=None):
        return traceback.format_exc(), 500
###


@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
    return r


from . import server_scrapbook
from . import server_browse
from . import server_export
from . import server_backup
from . import server_upload
from . import server_utils
from . import server_sync


@app.route("/")
def root():
    return "Scrapyard helper application"


@app.route("/exit")
@requires_auth
def exit_app():
    os._exit(0)

