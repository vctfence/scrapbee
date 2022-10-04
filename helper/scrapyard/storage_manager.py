import io
import os
import json
import shutil
import logging
import zipfile
import tempfile

from pathlib import Path

from . import storage_sync
from .storage_node_db import NodeDB

SCRAPYARD_DIRECTORY = "scrapyard"
CLOUD_DIRECTORY = "cloud"
OBJECT_DIRECTORY = "objects"
ARCHIVE_DIRECTORY = "archive"
NODE_DB_FILE = "index.jsbk"
NODE_OBJECT_FILE = "item.json"
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
    ARCHIVE_TYPE_FILES = "files"

    def __init__(self):
        self.bach_node_db = None

    def get_node_db_path(self, params):
        data_directory = os.path.expanduser(params["data_path"])
        return os.path.join(data_directory, NODE_DB_FILE)

    def get_object_root_directory(self, params):
        data_directory = os.path.expanduser(params["data_path"])
        return os.path.join(data_directory, OBJECT_DIRECTORY)

    def get_object_directory(self, params, uuid=None):
        if not uuid:
            uuid = params["uuid"]

        data_directory = os.path.expanduser(params["data_path"])
        return os.path.join(data_directory, OBJECT_DIRECTORY, uuid)

    def get_temp_directory(self):
        return os.path.join(tempfile.gettempdir(), SCRAPYARD_DIRECTORY)

    def get_cloud_archive_temp_directory(self, params):
        temp_directory = self.get_temp_directory()
        return os.path.join(temp_directory, CLOUD_DIRECTORY, params["uuid"], ARCHIVE_DIRECTORY)

    def get_node_object_path(self, object_directory):
        return os.path.join(object_directory, NODE_OBJECT_FILE)

    def get_icon_object_path(self, object_directory):
        return os.path.join(object_directory, ICON_OBJECT_FILE)

    def get_comments_object_path(self, object_directory):
        return os.path.join(object_directory, COMMENTS_OBJECT_FILE)

    def get_archive_unpacked_path(self, object_directory):
        return os.path.join(object_directory, ARCHIVE_DIRECTORY)

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
            try:
                f(self.bach_node_db)
            except Exception as e:
                logging.error(e)
        else:
            node_db_path = self.get_node_db_path(params)
            NodeDB.with_file(node_db_path, f)

    def check_directory(self, params):
        node_db_path = self.get_node_db_path(params)

        if os.path.exists(node_db_path):
            return dict(status="populated")
        else:
            return dict(error="empty")

    def clean_temp_directory(self):
        temp_directory = self.get_temp_directory()

        if os.path.exists(temp_directory):
            shutil.rmtree(temp_directory)

    def persist_node(self, params):
        def persist(node_db):
            node_db.add_node(params["node"])
            self.persist_node_object(params)

        self.with_node_db(params, persist)

    def update_node(self, params):
        def update(node_db):
            params["node"] = node_db.update_node(params["node"], params["remove_fields"])
            self.persist_node_object(params)

        self.with_node_db(params, update)

    def update_nodes(self, params):
        def update(node_db):
            nodes = params["nodes"]
            remove_fields = params["remove_fields"]

            for i in range(len(nodes)):
                updated_node = node_db.update_node(nodes[i], remove_fields[i])
                params["node"] = updated_node
                self.persist_node_object(params)

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
        object_directory_path = self.get_object_directory(params)
        object_file_path = os.path.join(object_directory_path, object_file_name)

        Path(object_directory_path).mkdir(parents=True, exist_ok=True)
        with open(object_file_path, "w", encoding="utf-8") as object_file:
            object_file.write(params[param_name])

    def persist_node_object(self, params):
        params["uuid"] = params["node"]["uuid"]
        params["node_json"] = json.dumps(params["node"], ensure_ascii=False, separators=(',', ':'))
        self.persist_object(NODE_OBJECT_FILE, params, "node_json")

    def persist_archive_content(self, params, files):
        object_directory_path = self.get_object_directory(params)

        if params.get("contains", None) == StorageManager.ARCHIVE_TYPE_FILES:
            archive_directory_path = self.get_archive_unpacked_path(object_directory_path)
            with zipfile.ZipFile(files["content"], "r", zipfile.ZIP_DEFLATED, False) as zip_file:
                zip_file.extractall(archive_directory_path)
        else:
            Path(object_directory_path).mkdir(parents=True, exist_ok=True)
            content_file_path = os.path.join(object_directory_path, ARCHIVE_CONTENT_FILE)
            files["content"].save(content_file_path)

    def save_archive_file(self, params, files):
        object_directory_path = self.get_object_directory(params)
        archive_directory_path = self.get_archive_unpacked_path(object_directory_path)
        archive_file_path = os.path.join(archive_directory_path, params["file"])

        Path(archive_directory_path).mkdir(parents=True, exist_ok=True)
        files["content"].save(archive_file_path)

        return archive_directory_path

    def fetch_object(self, object_file_name, params):
        object_directory_path = self.get_object_directory(params)
        object_file_path = os.path.join(object_directory_path, object_file_name)

        result = None
        if os.path.exists(object_file_path):
            with open(object_file_path, "r", encoding="utf-8") as object_file:
                result = object_file.read()

        return result

    def fetch_archive_content(self, params):
        object_directory_path = self.get_object_directory(params)
        archive_directory_path = os.path.join(object_directory_path, ARCHIVE_DIRECTORY)

        if os.path.exists(archive_directory_path):
            return self.fetch_unpacked_archive(archive_directory_path)
        else:
            return self.fetch_packed_archive(object_directory_path)

    def fetch_archive_file(self, params):
        object_directory_path = self.get_object_directory(params)
        archive_directory_path = self.get_archive_unpacked_path(object_directory_path)
        archive_file_path = os.path.join(archive_directory_path, params["file"])

        file_content = None
        if os.path.exists(archive_file_path):
            with open(archive_file_path, "rb") as archive_file:
                file_content = archive_file.read()

        return file_content

    def fetch_packed_archive(self, object_directory_path):
        content_file_path = os.path.join(object_directory_path, ARCHIVE_CONTENT_FILE)

        result = None
        if os.path.exists(content_file_path):
            with open(content_file_path, "rb") as content_file:
                return content_file.read()

        return result

    def fetch_unpacked_archive(self, archive_directory_path):
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            for root, dirs, files in os.walk(archive_directory_path):
                for file in files:
                    archive_filename = os.path.join(root.replace(archive_directory_path, ""), file)
                    filename = os.path.join(root, file)

                    with open(filename, "rb") as content_file:
                        file_content = content_file.read()

                    zip_file.writestr(archive_filename, file_content)

        return zip_buffer.getvalue()

    def persist_icon(self, params):
        self.persist_object(ICON_OBJECT_FILE, params, "icon_json")

    def persist_archive_index(self, params):
        self.persist_object(ARCHIVE_INDEX_OBJECT_FILE, params, "index_json")

    def persist_archive_object(self, params):
        self.persist_object(ARCHIVE_OBJECT_FILE, params, "archive_json")

    def fetch_archive_object(self, params):
        return self.fetch_object(ARCHIVE_OBJECT_FILE, params)

    def fetch_archive_metadata(self, params):
        archive_object_json = self.fetch_object(ARCHIVE_OBJECT_FILE, params)

        if archive_object_json:
            return json.loads(archive_object_json)

    def persist_notes_index(self, params):
        self.persist_object(NOTES_INDEX_OBJECT_FILE, params, "index_json")

    def persist_notes(self, params):
        existing_notes = self.fetch_notes(params) or "{}"
        existing_notes = json.loads(existing_notes)
        new_notes = json.loads(params["notes_json"])
        new_notes = {**existing_notes, **new_notes}
        params["notes_json"] = json.dumps(new_notes)
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

    def sync_open_session(self, params):
        storage_sync.open_session(self, params)

    def sync_close_session(self):
        storage_sync.close_session()

    def sync_compute(self, params):
        return storage_sync.compute_sync(self, params)

    def sync_pull_objects(self, params):
        return storage_sync.pull_sync_objects(self, params)

    def get_orphaned_items(self, params):
        object_root_directory = self.get_object_root_directory(params)

        if os.path.exists(object_root_directory):
            disk_items = os.listdir(object_root_directory)
            node_db_path = self.get_node_db_path(params)
            orphaned_items = []

            def test_orphaned(node_db):
                for uuid in disk_items:
                    if uuid not in node_db.nodes:
                        orphaned_items.append(uuid)

            NodeDB.with_file(node_db_path, test_orphaned)
            return orphaned_items

    def delete_orphaned_items(self, params):
        self.delete_node_content(params)

    def rebuild_item_index(self, params):
        node_db_path = self.get_node_db_path(params)
        object_root_directory = self.get_object_root_directory(params)
        node_db = NodeDB.from_file(node_db_path)

        node_db.nodes.clear()
        node_db.nodes[NodeDB.DEFAULT_SHELF_UUID] = node_db.create_default_shelf()

        for uuid in os.listdir(object_root_directory):
            node_object_file_path = os.path.join(object_root_directory, uuid, NODE_OBJECT_FILE)

            if os.path.exists(node_object_file_path):
                with open(node_object_file_path, "r", encoding="utf-8") as node_object_file:
                    node_json = node_object_file.read()
                    node = json.loads(node_json)
                    node_db.nodes[node["uuid"]] = node

        node_db.nodes = NodeDB.tree_sort_nodes(node_db.nodes)
        node_db.write(node_db_path)

    def debug_get_stored_node_instances(self, params):
        node_db_path = self.get_node_db_path(params)
        node_db = NodeDB.from_file(node_db_path)
        items = list(node_db.nodes.items())
        n_items = len(items)
        result = "{"

        for i in range(n_items):
            uuid, node = items[i]
            object_directory = self.get_object_directory(params, uuid)
            node_object_path = self.get_node_object_path(object_directory)

            node_object_json = "{}"
            if os.path.exists(node_object_path):
                with open(node_object_path, "r", encoding="utf-8") as node_object_file:
                    node_object_json = node_object_file.read()

            result += f'"{uuid}": {{"db_item": {json.dumps(node)}, "object_item": {node_object_json}}}'

            if i < n_items - 1:
                result += ","

        result += "}"

        return result
