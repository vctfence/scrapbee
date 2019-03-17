import threading, platform, os, random, string, json

from flask import Flask, g, request, send_from_directory
from werkzeug.serving import make_server

import db, config

#if os.environ["FLASK_DEBUG"] == "1":
#    db.init()


HOST = "localhost"
PORT = config.SCRAPYARD_PORT

server_dir = os.path.dirname(os.path.abspath(__file__))
static_dir = os.path.join(server_dir, "static")

app = Flask(__name__, static_url_path='', static_folder=static_dir)


def init():
    g.db = db.db_open()


app.before_first_request(init)


@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
    return r


@app.route('/api/scrapyard/version')
def get_scrapyard_version():
    """Returns Scrapyard version"""
    return config.SCRAPYARD_VERSION


@app.route('/api/add/bookmark', methods=["POST"])
def add_bookmark():
    """Adds a bookmark (an URL without attachment)

    Accepts JSON:

    :user:  user name
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
