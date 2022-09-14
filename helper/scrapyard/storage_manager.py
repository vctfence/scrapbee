import base64
import os
import json
import shutil
import logging
import time

from pathlib import Path
from datetime import datetime

from . import storage_sync
from .storage_node_db import NodeDB


OBJECT_DIRECTORY = "objects"
NODE_DB_FILE = "scrapbook.jsonl"
ICON_OBJECT_FILE = "icon.json"
ARCHIVE_INDEX_OBJECT_FILE = "archive_index.json"
ARCHIVE_OBJECT_FILE = "archive.json"
ARCHIVE_CONTENT_FILE = "archive_content.blob"
NOTES_INDEX_OBJECT_FILE = "notes_index.json"
NOTES_OBJECT_FILE = "notes.json"
COMMENTS_INDEX_OBJECT_FILE = "comments_index.json"
COMMENTS_OBJECT_FILE = "comments.json"


class StorageManager:
    ARCHIVE_TYPE_BYTES = "bytes"
    ARCHIVE_TYPE_TEXT = "text"

    def __init__(self):
        self.bach_node_db = None

    def get_node_db_path(self, params):
        data_directory = os.path.expanduser(params["data_path"])
        return os.path.join(data_directory, NODE_DB_FILE)

    def get_object_root_directory(self, params):
        return os.path.join(params["data_path"], OBJECT_DIRECTORY)

    def get_object_directory(self, params, uuid):
        return os.path.join(params["data_path"], OBJECT_DIRECTORY, uuid)

    def get_icon_object_path(self, object_directory):
        return os.path.join(object_directory, ICON_OBJECT_FILE)

    def get_archive_object_path(self, object_directory):
        return os.path.join(object_directory, ARCHIVE_OBJECT_FILE)

    def get_archive_content_path(self, object_directory):
        return os.path.join(object_directory, ARCHIVE_CONTENT_FILE)

    def get_archive_index_object_path(self, object_directory):
        return os.path.join(object_directory, ARCHIVE_INDEX_OBJECT_FILE)

    def get_notes_index_object_path(self, object_directory):
        return os.path.join(object_directory, NOTES_INDEX_OBJECT_FILE)

    def get_comments_index_object_path(self, object_directory):
        return os.path.join(object_directory, COMMENTS_INDEX_OBJECT_FILE)

    def open_batch_session(self, params):
        node_db_path = self.get_node_db_path(params)
        self.bach_node_db = NodeDB.from_file(node_db_path)

    def close_batch_session(self, params):
        if self.bach_node_db:
            node_db_path = self.get_node_db_path(params)
            self.bach_node_db.write(node_db_path)
            self.bach_node_db = None

    def with_node_db(self, params, f):
        if self.bach_node_db:
            f(self.bach_node_db)
        else:
            node_db_path = self.get_node_db_path(params)
            NodeDB.with_file(node_db_path, f)

    def check_directory(self, params):
        node_db_path = self.get_node_db_path(params)

        if os.path.exists(node_db_path):
            return dict(status="populated")
        else:
            return dict(error="empty")

    def persist_node(self, params):
        def persist(node_db):
            node_db.add_node(params["node"])

        self.with_node_db(params, persist)

    def update_node(self, params):
        def update(node_db):
            node_db.update_node(params["node"], params["remove_fields"])

        self.with_node_db(params, update)

    def update_nodes(self, params):
        def update(node_db):
            for node in params["nodes"]:
                node_db.update_node(node, None)

        self.with_node_db(params, update)

    def delete_nodes(self, params):
        self.delete_nodes_shallow(params)
        self.delete_node_content(params)

    def delete_nodes_shallow(self, params):
        def delete(node_db):
            for uuid in params["node_uuids"]:
                node_db.delete_node(uuid)

        self.with_node_db(params, delete)

    def delete_node_content(self, params):
        for uuid in params["node_uuids"]:
            object_directory_path = self.get_object_directory(params, uuid)
            try:
                shutil.rmtree(object_directory_path)
            except Exception as e:
                pass

    def wipe_storage(self, params):
        if self.bach_node_db:
            self.bach_node_db.reset()

        try:
            node_db_path = self.get_node_db_path(params)
            os.remove(node_db_path)
        except Exception as e:
            logging.error(e)

        try:
            object_root_directory = self.get_object_root_directory(params)
            shutil.rmtree(object_root_directory)
        except Exception as e:
            logging.error(e)

    def persist_object(self, object_file_name, params, param_name):
        if object_file_name == ARCHIVE_OBJECT_FILE:
            self.persist_archive_content(params)
        else:
            self.persist_object_content(object_file_name, params, param_name)

    def persist_object_content(self, object_file_name, params, param_name):
        object_directory_path = self.get_object_directory(params, params["uuid"])
        object_file_path = os.path.join(object_directory_path, object_file_name)

        Path(object_directory_path).mkdir(parents=True, exist_ok=True)
        with open(object_file_path, "w", encoding="utf-8") as object_file:
            object_file.write(params[param_name])

    def persist_archive_content(self, params):
        object_directory_path = self.get_object_directory(params, params["uuid"])
        object_file_path = os.path.join(object_directory_path, ARCHIVE_OBJECT_FILE)
        content_file_path = os.path.join(object_directory_path, ARCHIVE_CONTENT_FILE)

        archive_object = json.loads(params["archive_json"])
        archive_content = archive_object["content"]
        archive_type = archive_object["type"]

        del archive_object["content"]
        archive_object = json.dumps(archive_object)

        Path(object_directory_path).mkdir(parents=True, exist_ok=True)
        with open(object_file_path, "w", encoding="utf-8") as object_file:
            object_file.write(archive_object)

        if archive_type == StorageManager.ARCHIVE_TYPE_BYTES:
            archive_content = base64.b64decode(archive_content)
            with open(content_file_path, "wb") as content_file:
                content_file.write(archive_content)
        else:
            with open(content_file_path, "w", encoding="utf-8") as content_file:
                content_file.write(archive_content)

    def fetch_object(self, object_file_name, params):
        if object_file_name == ARCHIVE_OBJECT_FILE:
            return self.fetch_archive_content(params)
        else:
            return self.fetch_object_content(object_file_name, params)

    def fetch_object_content(self, object_file_name, params):
        object_directory_path = self.get_object_directory(params, params["uuid"])
        object_file_path = os.path.join(object_directory_path, object_file_name)

        result = None
        if os.path.exists(object_file_path):
            with open(object_file_path, "r", encoding="utf-8") as object_file:
                result = object_file.read()

        return result

    def fetch_archive_content(self, params, meta_only=False):
        object_directory_path = self.get_object_directory(params, params["uuid"])
        object_file_path = os.path.join(object_directory_path, ARCHIVE_OBJECT_FILE)
        content_file_path = os.path.join(object_directory_path, ARCHIVE_CONTENT_FILE)

        archive_object = None
        if os.path.exists(object_file_path):
            with open(object_file_path, "r", encoding="utf-8") as object_file:
                archive_object = object_file.read()
                archive_object = json.loads(archive_object)

        if meta_only:
            return archive_object

        archive_content = None
        if archive_object["type"] == StorageManager.ARCHIVE_TYPE_BYTES:
            with open(content_file_path, "rb") as content_file:
                archive_content = content_file.read()
                archive_content = base64.b64encode(archive_content)
        else:
            with open(content_file_path, "r", encoding="utf-8") as content_file:
                archive_content = content_file.read()

        archive_object["content"] = archive_content

        return archive_object

    def persist_icon(self, params):
        self.persist_object(ICON_OBJECT_FILE, params, "icon_json")

    def persist_archive_index(self, params):
        self.persist_object(ARCHIVE_INDEX_OBJECT_FILE, params, "index_json")

    def persist_archive(self, params):
        self.persist_object(ARCHIVE_OBJECT_FILE, params, "archive_json")

    def fetch_archive(self, params):
        return self.fetch_object(ARCHIVE_OBJECT_FILE, params)

    def fetch_archive_metadata(self, params):
        return self.fetch_archive_content(params, True)

    def persist_notes_index(self, params):
        self.persist_object(NOTES_INDEX_OBJECT_FILE, params, "index_json")

    def persist_notes(self, params):
        self.persist_object(NOTES_OBJECT_FILE, params, "notes_json")

    def fetch_notes(self, params):
        return self.fetch_object(NOTES_OBJECT_FILE, params)

    def persist_comments_index(self, params):
        self.persist_object(COMMENTS_INDEX_OBJECT_FILE, params, "index_json")

    def persist_comments(self, params):
        self.persist_object(COMMENTS_OBJECT_FILE, params, "comments_json")

    def fetch_comments(self, params):
        return self.fetch_object(COMMENTS_OBJECT_FILE, params)

    def get_metadata(self, params):
        result = {"error": "error"}

        try:
            node_db_path = self.get_node_db_path(params)
            if os.path.exists(node_db_path):
                header = NodeDB.read_header(node_db_path)
                if header != "":
                    result = header
                else:
                    result = {"error": "empty"}
            else:
                result = {"error": "empty"}
        except Exception as e:
            logging.error(e)

        return result

    def sync_open_session(self, client_id, params):
        storage_sync.open_session(self, client_id, params)

    def sync_close_session(self, client_id):
        storage_sync.close_session(client_id)

    def sync_compute(self, client_id, params):
        return storage_sync.compute_sync(self, client_id, params)

    def sync_pull_objects(self, client_id, params):
        return storage_sync.pull_sync_objects(self, client_id, params)




