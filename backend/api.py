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

    user = db.query_user(g.db, user)

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
    """ Returns Scrapyard version """
    return config.SCRAPYARD_VERSION


@app.route('/api/add/bookmark', methods=["POST"])
@authenticated
def add_bookmark():
    """ Adds a bookmark to database (an URL without attachment).

    Accepts JSON:

    :name:  bookmark name (string)
    :uri:   bookmark URL (string)
    :path:  hierarchical node group path, the first item in the path is a name of a shelf (string)
    :tags:  comma-separated list of tags (string)
    
    :returns: the original JSON with the inserted DB-record ID added
    """
    return db.add_bookmark(g.db, g.user_id, request.json)


@app.route('/api/list/nodes', methods=["POST"])
@authenticated
def list_nodes():
    """ Lists the specified nodes.

        Accepts JSON:

        :search: filter for node name or URL (string)
        :path:   filter hierarchical node group path, the first item in the path is a name of a shelf (string)
        :tags:   filter for node tags (string)
        :type:   filter for node type (integer)
        :limit:  limit for the returned record number (integer)
        :depth:  specify depth of search (string): "group" or "subtree"

        :returns: list of filtered node database records
    """
    return db.list_nodes(g.db, g.user_id, request.json)


@app.route('/api/list/shelves', methods=["GET"])
@authenticated
def list_shelves():
    """ Lists all user's shelves. """
    return db.list_shelves(g.db, g.user_id)


@app.route('/api/completion/groups', methods=["GET"])
@authenticated
def list_groups():
    """ Lists all user's groups for use in completion. """
    return db.list_groups(g.db, g.user_id)


@app.route('/api/completion/tags', methods=["GET"])
@authenticated
def list_tags():
    """ Lists all user's tags for use in completion. """
    return db.list_tags(g.db, g.user_id)


@app.route('/api/create/shelf', methods=["POST"])
@authenticated
def create_shelf():
    """ Creates a shelf

        Accepts JSON:

        :name: Shelf name (string)

        :returns: created shelf database record """
    return db.new_shelf(g.db, g.user_id, request.json)


@app.route('/api/rename/shelf', methods=["POST"])
@authenticated
def rename_shelf():
    """ Creates a shelf

        Accepts JSON:

        :name: Shelf name (string)
        :new_name: New shelf name (string) """
    return db.rename_shelf(g.db, g.user_id, request.json)


@app.route('/api/delete/shelf', methods=["POST"])
@authenticated
def delete_shelf():
    """ Deletes a shelf

        Accepts JSON:

        :name: Shelf name (string) """
    return db.delete_shelf(g.db, g.user_id, request.json)


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
