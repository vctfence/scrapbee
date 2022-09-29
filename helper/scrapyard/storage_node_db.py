import os
import json
import logging
import uuid

from datetime import datetime
from pathlib import Path


class NodeDB:
    FORMAT_VERSION = 1
    DEFAULT_SHELF_NAME = "default"
    DEFAULT_SHELF_UUID = "default"

    def __init__(self):
        self.header = self.create_format_header()
        self.nodes = dict()

    @classmethod
    def from_file(cls, path):
        db = cls()
        db.read(path)
        return db

    @classmethod
    def with_file(cls, path, f):
        node_db = cls.from_file(path)

        try:
            f(node_db)
        except Exception as e:
            logging.error(e)

        node_db.write(path)

    @classmethod
    def iterate(cls, path, f):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as node_db_file:
                node_db_file.readline()  # header

                node_json = node_db_file.readline()

                while node_json != "":
                    try:
                        f(json.loads(node_json))
                    except Exception as e:
                        logging.error(e)

                    node_json = node_db_file.readline()

    @classmethod
    def generate_uuid(cls):
        new_uuid = str(uuid.uuid4())
        new_uuid = new_uuid.replace("-", "")
        return new_uuid.upper()

    def create_format_header(self):
        return {
            "format": "JSON Scrapbook",
            "version": NodeDB.FORMAT_VERSION,
            "type": "index",
            "contains": "everything",
            "generator": "Scrapyard",
            "uuid": NodeDB.generate_uuid(),
            "entities": 0
        }

    def populate_format_header(self):
        self.header["entities"] = len(self.nodes)
        now = datetime.now()
        self.header["timestamp"] = int(now.timestamp() * 1000)
        self.header["date"] = now.isoformat()

    def create_default_shelf(self):
        return {
            "type": "shelf",
            "uuid": NodeDB.DEFAULT_SHELF_UUID,
            "title": NodeDB.DEFAULT_SHELF_NAME,
            "date_added": int(datetime.now().timestamp() * 1000),
            "date_modified": 0,
            "pos": 1
        }

    @classmethod
    def read_header(cls, path):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as node_db_file:
                return node_db_file.readline()

    def read(self, path):
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as node_db_file:
                header_json = node_db_file.readline()
                nodes_json = []

                if header_json != "":
                    nodes_json = node_db_file.readlines()
                    self.header = json.loads(header_json)

                for node_json in nodes_json:
                    if node_json:
                        node = json.loads(node_json)
                        self.nodes[node["uuid"]] = node

        if not self.header:
            self.header = self.create_format_header()

        if len(self.nodes) == 0:
            self.nodes[NodeDB.DEFAULT_SHELF_UUID] = self.create_default_shelf()

    def write(self, path):
        self.populate_format_header()

        entries = [self.header]
        entries += list(self.nodes.values())
        json_entries = [json.dumps(e, ensure_ascii=False, separators=(',', ':')) for e in entries]

        content = "\n".join(json_entries)

        if not os.path.exists(path):
            directory = os.path.dirname(path)
            Path(directory).mkdir(parents=True, exist_ok=True)

        with open(path, "w", encoding="utf-8") as node_db_file:
            node_db_file.write(content)

    def reset(self):
        self.nodes.clear()
        self.nodes[NodeDB.DEFAULT_SHELF_UUID] = self.create_default_shelf()
        self.header = self.create_format_header()

    def add_node(self, node):
        self.nodes[node["uuid"]] = node

    def update_node(self, update, remove_fields):
        node = self.nodes.get(update["uuid"], None)
        result = update

        if node:
            result = {**node, **update}

            if remove_fields:
                for field in remove_fields:
                    if field in result:
                        del result[field]

            self.nodes[update["uuid"]] = result
        else:
            self.nodes[update["uuid"]] = update

        return result

    def delete_node(self, uuid):
        if uuid in self.nodes:
            del self.nodes[uuid]
