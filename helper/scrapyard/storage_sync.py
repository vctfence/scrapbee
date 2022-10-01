import os
import json
import logging
import time

from .storage_node_db import NodeDB


g_sync_operations = dict()


def compute_sync(storage_manager, params):
    node_db_path = storage_manager.get_node_db_path(params)
    nodes_incoming = json.loads(params["nodes"])
    last_sync_date = int(params["last_sync_date"])

    uuid2node_incoming = dict()
    uuid2node_storage = dict()
    from_storage = set()
    incoming = set()
    common = set()
    new_in_storage = set()
    new_incoming = set()
    updated_in_storage = set()
    updated_incoming = set()
    deleted_in_storage = set()
    deleted_incoming = set()

    for node in nodes_incoming:
        incoming.add(node["uuid"])
        uuid2node_incoming[node["uuid"]] = node

    uuid2node_storage = dict()

    def read_storage_node(node):
        uuid2node_storage[node["uuid"]] = make_sync_node(node)

    NodeDB.iterate(node_db_path, read_storage_node)

    from_storage = set(uuid2node_storage.keys())

    common = from_storage & incoming

    for uuid in common:
        incoming_node = uuid2node_incoming[uuid]
        db_node = uuid2node_storage[uuid]

        if incoming_node["date_modified"] > db_node["date_modified"]:
            updated_incoming.add(uuid)
        elif incoming_node["date_modified"] < db_node["date_modified"]:
            updated_in_storage.add(uuid)

    new_incoming = incoming - common
    new_in_storage = from_storage - common

    for uuid in new_incoming:
        if uuid2node_incoming[uuid]["date_modified"] < last_sync_date:
            deleted_incoming.add(uuid)

    for uuid in new_in_storage:
        if uuid2node_storage[uuid]["date_modified"] < last_sync_date:
            deleted_in_storage.add(uuid)

    # new_incoming -= deleted_incoming
    new_in_storage -= deleted_in_storage

    # push = new_incoming | updated_incoming
    pull = new_in_storage | updated_in_storage

    db_tree = tree_sort_database(uuid2node_storage)

    # keeping the correct order
    # push_nodes = [n for n in nodes_incoming if n["uuid"] in push]
    pull_nodes = [make_sync_node(n) for n in db_tree if n["uuid"] in pull]

    # for n in push_nodes:
    #     n["push_content"] = "content_modified" in n and (n["uuid"] in new_incoming
    #                                                      or n["content_modified"] > last_sync_date)

    for n in pull_nodes:
        n["pull_content"] = "content_modified" in n and (n["uuid"] in new_in_storage
                                                         or n["content_modified"] > last_sync_date)

    global g_sync_operations
    g_sync_operations = {
        "push": [], # push_nodes,
        "pull": pull_nodes,
        "delete": [uuid2node_incoming[n] for n in deleted_incoming],
        "delete_in_storage": [] # [uuid2node_storage[n] for n in deleted_in_storage]
    }

    return g_sync_operations


def make_sync_node(node):
    result = {
        "uuid": node["uuid"],
        "date_modified": node["date_modified"]
    }

    if "parent" in node:
        result["parent"] = node["parent"]

    if "content_modified" in node:
        result["content_modified"] = node["content_modified"]

    return result


def tree_sort_database(nodes):
    items = nodes.items()
    children = dict()
    roots = []

    for uuid, n in items:
        parent_uuid = n.get("parent", None)
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


def open_session(storage_manager, params):
    pass


def close_session():
    global g_sync_operations
    g_sync_operations = None


def pull_sync_objects(storage_manager, params):
    sync_nodes = json.loads(params["sync_nodes"])

    assert len(sync_nodes) > 1

    result = "["

    for sync_node in sync_nodes[:-1]:
        result += assemble_node_payload(storage_manager, params, sync_node) + ","

    result += assemble_node_payload(storage_manager, params, sync_nodes[-1]) + "]"

    return result


def assemble_node_payload(storage_manager, params, sync_node):
    uuid = sync_node["uuid"]
    result = "{"

    object_directory_path = storage_manager.get_object_directory(params, uuid)
    node_object_path = storage_manager.get_node_object_path(object_directory_path)
    node_object = read_object_file(node_object_path)
    if node_object:
        result += "\"item\":" + node_object

    if sync_node["pull_content"]:
        icon_object_path = storage_manager.get_icon_object_path(object_directory_path)
        icon_object = read_object_file(icon_object_path)
        if icon_object:
            result += ",\"icon\":" + icon_object

        comments_object_path = storage_manager.get_comments_object_path(object_directory_path)
        comments_object = read_object_file(comments_object_path)
        if comments_object:
            result += ",\"comments\":" + comments_object

        archive_index_object_path = storage_manager.get_archive_index_object_path(object_directory_path)
        archive_index_object = read_object_file(archive_index_object_path)
        if archive_index_object:
            result += ",\"archive_index\":" + archive_index_object

        notes_index_object_path = storage_manager.get_notes_index_object_path(object_directory_path)
        notes_index_object = read_object_file(notes_index_object_path)
        if notes_index_object:
            result += ",\"notes_index\":" + notes_index_object

        comments_index_object_path = storage_manager.get_comments_index_object_path(object_directory_path)
        comments_index_object = read_object_file(comments_index_object_path)
        if comments_index_object:
            result += ",\"comments_index\":" + comments_index_object

    result += "}"

    return result


def read_object_file(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as object_file:
            return object_file.readline()

