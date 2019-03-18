import threading, platform, os, random, string, json, hmac

from functools import wraps
from flask import Flask, g, request, make_response, send_from_directory
from werkzeug.serving import make_server
from base64 import b64encode, b64decode
from hashlib import sha1

import db, config


HOST = "localhost"
PORT = config.SCRAPYARD_PORT

server_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(server_dir, "static")

app = Flask(__name__, static_url_path='', static_folder=static_dir)


def check_sid(header):
    try:
        user, password = header.split(':')
    except Exception as e:
        return None

    if not hasattr(g, "db"):
        g.db = db.open()

    user = db.get_user(g.db, user)

    print(password)

    if user and user["sid"] == hmac.new(password.encode("ascii"), user["name"].encode("ascii"), sha1).hexdigest():
        return user["id"]
    else:
        return None


def authenticated(f):
    @wraps(f)
    def _f(*args, **kwargs):
        try:
            user_id = check_sid(request.headers['X-Scrapyard-Auth'])
        except KeyError:
            user_id = None

        if user_id:
            g.user_id = user_id
            return f(*args, **kwargs)
        else:
            response = make_response('Auth error', 403)
            response.headers['Content-Type'] = 'text/plain'
            return response
    return _f


def init():
    if not hasattr(g, "db"):
        g.db = db.open()


app.before_first_request(init)


@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
    return r


@app.route('/api/scrapyard/version')
@authenticated
def get_scrapyard_version():
    """Returns Scrapyard version"""
    return config.SCRAPYARD_VERSION


@app.route('/api/add/bookmark', methods=["POST"])
@authenticated
def add_bookmark():
    """Adds a bookmark (an URL without attachment)

    Accepts JSON:

    :name:  bookmark name
    :uri:   bookmark URL
    :group: hierarchical group path, the first item in the path is a name of a shelf
    :tags:  comma-separated list of tags
    
    :returns: the original JSON with the inserted DB-record ID added
    """
    return db.add_bookmark(g.db, request.json)


class Httpd(threading.Thread):

    def __init__(self, app):
        threading.Thread.__init__(self)
        self.srv = make_server(HOST, PORT, app)
        self.ctx = app.app_context()
        self.ctx.push()

    def run(self):
        self.srv.serve_forever()

    def shutdown(self):
        self.srv.shutdown()

httpd = None

def start():
    global httpd
    httpd = Httpd(app)
    #httpd.setDaemon(True)
    httpd.start()

def stop():
    global httpd
    httpd.shutdown()
