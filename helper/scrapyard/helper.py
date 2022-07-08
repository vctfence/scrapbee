import json

from . import server, browser

VERSION = "1.0"


def main():
    while True:
        msg = browser.get_message()
        process_message(msg)


def process_message(msg):
    if msg["type"] == "INITIALIZE":
        server.start(msg["port"], msg["auth"])
        browser.send_message(json.dumps({"type": "INITIALIZED", "version": VERSION}))


if __name__ == "__main__":
    main()
