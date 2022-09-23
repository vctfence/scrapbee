import json
import logging
import os

from . import server, browser
from .server import storage_manager


VERSION = "2.0"


def main():
    storage_manager.clean_temp_directory()

    while True:
        msg = browser.get_message()
        process_message(msg)


def process_message(msg):
    if msg["type"] == "INITIALIZE":
        start_server(msg)
    elif msg["type"] == "BACKUP_PUSH_TEXT":
        server.message_queue.put(msg["text"])
    elif msg["type"] == "EXPORT_PUSH_TEXT":
        server.message_queue.put(msg["text"])
    elif msg["type"] == "BACKUP_FINISH":
        server.message_queue.put(None)
    elif msg["type"] == "EXPORT_FINISH":
        server.message_queue.put(None)
    elif msg["type"] == "RDF_PATH":
        server.message_queue.put(msg)
    elif msg["type"] == "ARCHIVE_INFO":
        server.message_queue.put(msg)


def start_server(msg):
    start_success = server.start(msg["port"], msg["auth"])
    response = {"type": "INITIALIZED", "version": VERSION}

    if not start_success:
        response["error"] = "address_in_use"

    browser.send_message(json.dumps(response))


if __name__ == "__main__":
    main()
