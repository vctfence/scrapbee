import json
import logging
import os

from datetime import datetime
import shutil

SYNC_VERSION = 1
SYNC_DB_FILE = "scrapyard.jsonl"

DEFAULT_SHELF_UUID = "1"

def get_sync_db_path(sync_directory):
    return f"{sync_directory}/{SYNC_DB_FILE}"


def get_object_file_path(object_dir, uuid):
    return f"{object_dir}/{uuid}.jsonl"


def get_object_directory_path(sync_directory):
    return f"{sync_directory}/objects"


def create_empty_db_header():
    return {"sync": "Scrapyard", "version": SYNC_VERSION, "entities": 0}


def create_empty_db():
    return {"nodes": []}


def read_sync_db_header(sync_directory):
    sync_directory = os.path.expanduser(sync_directory)

    with open(get_sync_db_path(sync_directory), "r", encoding="utf-8") as sync_db_file:
        header_json = sync_db_file.readline()
        if header_json != "":
            return json.loads(header_json)
        else:
            return create_empty_db_header()


def read_sync_db(sync_directory):
    sync_directory = os.path.expanduser(sync_directory)

    with open(get_sync_db_path(sync_directory), "r", encoding="utf-8") as sync_db_file:
        header_json = sync_db_file.readline()
        sync_db = create_empty_db()

        if header_json != "":
            db_json = sync_db_file.readline()
            if db_json:
                sync_db = json.loads(db_json)

        node_dict = dict()
        nodes = sync_db["nodes"]

        for n in nodes:
            node_dict[n["uuid"]] = n

        sync_db["nodes"] = node_dict
        return sync_db


def write_sync_db(sync_directory, sync_db):
    sync_directory = os.path.expanduser(sync_directory)

    if type(sync_db["nodes"]) is dict:
        sync_db["nodes"] = list(sync_db["nodes"].values())
        if len(sync_db["nodes"]) == 1 and sync_db["nodes"][0]["uuid"] == DEFAULT_SHELF_UUID:
            sync_db["nodes"] = []

    header = create_empty_db_header()
    header["entities"] = len(sync_db["nodes"])
    now = datetime.now()
    header["timestamp"] = int(now.timestamp() * 1000)
    header["date"] = now.isoformat()

    if type(sync_db["nodes"]) is dict:
        sync_db["nodes"] = list(sync_db["nodes"].values())

    with open(get_sync_db_path(sync_directory), "w", encoding="utf-8") as sync_db_file:
        sync_db_file.write(json.dumps(header))
        sync_db_file.write("\n")
        sync_db_file.write(json.dumps(sync_db))


def init_sync_db(sync_directory):
    is_empty = True
    sync_directory = os.path.expanduser(sync_directory)

    try:
        objects_dir = get_object_directory_path(sync_directory)
        if not os.path.exists(objects_dir):
            os.makedirs(objects_dir)

        db_path = get_sync_db_path(sync_directory)
        if not os.path.exists(db_path):
            write_sync_db(sync_directory, create_empty_db())
        else:
            header = read_sync_db_header(sync_directory)
            is_empty = header["entities"] == 0
    except Exception as e:
        logging.error(e)

    return is_empty


def get_sync_properties(sync_directory):
    result = {"error": "error"}
    sync_directory = os.path.expanduser(sync_directory)

    try:
        sync_db_path = get_sync_db_path(sync_directory)
        if os.path.exists(sync_db_path):
            header = read_sync_db_header(sync_directory)
            result = None
            result = header
        else:
            result["error"] = "empty"
    except Exception as e:
        logging.error(e)

    return result


def compute_sync(params):
    sync_directory = params["sync_directory"]
    nodes_incoming = json.loads(params["nodes"])
    last_sync_date = int(params["last_sync_date"])

    sync_directory = os.path.expanduser(sync_directory)

    uuid2node_incoming = dict()
    uuid2node_db = dict()
    from_db = set()
    incoming = set()
    common = set()
    new_in_db = set()
    new_incoming = set()
    updated_in_db = set()
    updated_incoming = set()
    deleted_in_db = set()
    deleted_incoming = set()

    for node in nodes_incoming:
        incoming.add(node["uuid"])
        uuid2node_incoming[node["uuid"]] = node

    sync_db = read_sync_db(sync_directory)
    uuid2node_db = sync_db["nodes"]
    from_db = set(uuid2node_db.keys())

    common = from_db & incoming

    for uuid in common:
        node_incoming = uuid2node_incoming[uuid]
        node_db = uuid2node_db[uuid]

        if node_incoming["date_modified"] > node_db["date_modified"]:
            updated_incoming.add(uuid)
        elif node_incoming["date_modified"] < node_db["date_modified"]:
            updated_in_db.add(uuid)

    new_incoming = incoming - common
    new_in_db = from_db - common

    for uuid in new_incoming:
        if uuid2node_incoming[uuid]["date_modified"] < last_sync_date:
            deleted_incoming.add(uuid)

    for uuid in new_in_db:
        if uuid2node_db[uuid]["date_modified"] < last_sync_date:
            deleted_in_db.add(uuid)

    new_incoming -= deleted_incoming
    new_in_db -= deleted_in_db

    push = new_incoming | updated_incoming
    pull = new_in_db | updated_in_db

    db_tree = tree_sort_database(sync_db["nodes"])

    # keeping the correct order
    push_nodes = [n for n in nodes_incoming if n["uuid"] in push]
    pull_nodes = [make_sync_node(n) for n in db_tree if n["uuid"] in pull]

    for n in push_nodes:
        n["push_content"] = "content_modified" in n and (n["uuid"] in new_incoming
                                                         or n["content_modified"] > last_sync_date)

    for n in pull_nodes:
        n["pull_content"] = "content_modified" in n and (n["uuid"] in new_in_db
                                                         or n["content_modified"] > last_sync_date)

    result = {
        "push": push_nodes,
        "pull": pull_nodes,
        "delete": [uuid2node_incoming[n] for n in deleted_incoming],
        "delete_in_sync": [make_sync_node(uuid2node_db[n]) for n in deleted_in_db]
    }

    return result


def make_sync_node(node):
    result = {
        "uuid": node["uuid"],
        "date_modified": node["date_modified"]
    }

    if "parent_id" in node:
        result["parent_id"] = node["parent_id"]

    if "content_modified" in node:
        result["content_modified"] = node["content_modified"]

    return result


def tree_sort_database(nodes):
    items = nodes.items()
    children = dict()
    roots = []

    for uuid, n in items:
        parent_uuid = n.get("parent_id", None)
        if parent_uuid is None:
            roots.append(n)
        else:
            if parent_uuid in children:
                children[parent_uuid].append(uuid)
            else:
                children[parent_uuid] = [uuid]

    def get_subtree(p, acc=[]):
        children_uuids = children.get(p["uuid"], None)

        if children_uuids:
            for uuid in children_uuids:
                node = nodes[uuid]
                acc.append(node)
                get_subtree(node, acc)

        return acc

    result = roots[:]

    for r in roots:
        result += get_subtree(r, [])

    return result


g_sync_db = None
g_sync_directory = None
g_sync_objects_directory = None


def open_sync_session(sync_directory):
    sync_directory = os.path.expanduser(sync_directory)

    global g_sync_db, g_sync_directory, g_sync_objects_directory
    g_sync_db = read_sync_db(sync_directory)
    g_sync_directory = sync_directory
    g_sync_objects_directory = get_object_directory_path(sync_directory)


def close_sync_session():
    global g_sync_db, g_sync_directory, g_sync_objects_directory

    write_sync_db(g_sync_directory, g_sync_db)

    g_sync_objects_directory = None
    g_sync_directory = None
    g_sync_db = None


def delete_nodes_in_db(nodes):
    for node in nodes:
        try:
            uuid = node["uuid"]
            db_nodes = g_sync_db["nodes"]
            if uuid in db_nodes:
                del db_nodes[uuid]
                os.remove(get_object_file_path(g_sync_objects_directory, uuid))
        except Exception as e:
            logging.error(e)


def push_sync_objects(params):
    node = json.loads(params["node"])
    content = params.get("content", None)
    uuid = node["uuid"]

    if content:
        object_file_path = get_object_file_path(g_sync_objects_directory, uuid)
        with open(object_file_path, "w", encoding="utf-8") as object_file:
            object_file.write(content)

    g_sync_db["nodes"][uuid] = node


def pull_sync_objects(params):
    sync_node = json.loads(params["node"])
    uuid = sync_node["uuid"]

    result = {"node": g_sync_db["nodes"][uuid]}

    if sync_node["pull_content"]:
        object_file_path = get_object_file_path(g_sync_objects_directory, uuid)
        if os.path.exists(object_file_path):
            with open(object_file_path, "r", encoding="utf-8") as object_file:
                content = object_file.read()
                if content != "":
                    result["content"] = content

    return result


def reset_sync_db(sync_directory):
    sync_directory = os.path.expanduser(sync_directory)
    shutil.rmtree(get_object_directory_path(sync_directory), True)
    os.remove(get_sync_db_path(sync_directory))
