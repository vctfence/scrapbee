import json

from . import server, browser

VERSION = "1.2"


def main():
    while True:
        msg = browser.get_message()
        process_message(msg)


def process_message(msg):
    if msg["type"] == "INITIALIZE":
        start_server(msg)
    elif msg["type"] == "BACKUP_PUSH_TEXT":
        server.message_queue.put(msg["text"])
    elif msg["type"] == "BACKUP_FINISH":
        server.message_queue.put(None)
    elif msg["type"] == "PUSH_BLOB":
        server.message_queue.put(msg)
    elif msg["type"] == "RDF_PATH":
        server.message_queue.put(msg)


def start_server(msg):
    start_success = server.start(msg["port"], msg["auth"])
    response = {"type": "INITIALIZED", "version": VERSION}

    if not start_success:
        response["error"] = "address_in_use"

    browser.send_message(json.dumps(response))


if __name__ == "__main__":
    main()
