import json as serializer

import config

from pydal import DAL, Field
from datetime import datetime


NODE_TYPE_GROUP = 1
NODE_TYPE_BOOKMARK = 2
NODE_TYPE_ARCHIVE = 3

DEFAULT_SHELF_NAME = "default"

DEFAULT_OUTPUT_LIMIT = 50


def open():
    db = DAL('sqlite://' + config.SCRAPYARD_INDEX_PATH, migrate_enabled=False)
    
    db.define_table('user', Field('id', type='integer'), Field('name'), Field('sid'))
    db.define_table('shelf', Field('id', type='integer'), Field('user_id', type='integer'), Field('name'),
                    Field('file'))
    db.define_table('node', Field('id', type='integer'), Field('uuid', type='text'), Field('type', type='integer'),
                    Field('shelf_id', type='integer'), Field('name'), Field('uri'), Field('path'), Field('icon'),
                    Field('pos', type='integer'), Field('parent_id'), Field('date_added', 'datetime'))
    db.define_table('attachment', Field('id', type='integer'), Field('node_id', type='integer'),
                    Field('uuid', type='text'), Field('name'))
    db.define_table('tag', Field('id', type='integer'), Field('user_id', type='integer'), Field('name'))
    db.define_table('tag_to_node', Field('tag_id', type='integer'), Field('node_id', type='integer'))
    
    return db


def query_user(db, name):
    rows = db(db.user.name.upper() == name.upper()).select()

    if len(rows) > 0:
        return rows[0]


def query_shelf(db, user_id, name):
    if not name:
        name = DEFAULT_SHELF_NAME

    rows = db((db.shelf.name.upper() == name.upper()) & (db.shelf.user_id == user_id)).select()

    if rows:
        return rows[0]


def create_shelf(db, user_id, name):
    file = name + ".org"
    id = db.shelf.insert(user_id=user_id, name=name, file=file)

    return {"id": id, "user_id": user_id, "name": name, "file": file}


# creates, if not exists
def get_shelf(db, user_id, name):
    shelf = query_shelf(db, user_id, name)

    if shelf:
        return shelf
    else:
        return create_shelf(db, user_id, name)


# for use in CRUD API
def new_shelf(db, user_id, json):
    name = json.get("name", None)

    if not name or name == DEFAULT_SHELF_NAME:
        return ""

    shelf = get_shelf(db, user_id, name)

    if shelf:
        db.commit()
        return serializer.dumps(shelf)
    else:
        return ""


# for use in CRUD API
def rename_shelf(db, user_id, json):
    name = json.get("name", None)
    new_name = json.get("new_name", None)

    if not name or name == DEFAULT_SHELF_NAME:
        return ""

    if new_name:
        shelf = query_shelf(db, user_id, name)
        if shelf:
            shelf.name = new_name
            shelf.update_record()
            db.commit()
            return "{}"

    return ""


# for use in CRUD API
def delete_shelf(db, user_id, json):
    name = json.get("name", None)

    if not name or name == DEFAULT_SHELF_NAME:
        return ""

    shelf = get_shelf(db, user_id, name)

    if shelf:
        shelf.delete_record()
        db.commit()

    return "{}"



def query_group(db, shelf_id, path):
    full_name = "/".join(path)
    rows = db((db.node.path.upper() == full_name.upper()) & (db.node.shelf_id == shelf_id)).select()
    if rows:
        return rows[0]


def create_group(db, shelf_id, name):
    def create_subgroup(parent, simple_name, full_name, date_added):
        parent_id = parent["id"] if parent else None
        id = db.node.insert(shelf_id=shelf_id, parent_id=parent_id, type=NODE_TYPE_GROUP, name=simple_name,
                            path=full_name, date_added=date_added)
        return {"id": id, "shelf_id": shelf_id, "parent_id": parent_id, "name": simple_name, "path": full_name,
                "date_added": date_added, "type": 0}

    def do_create(parent, tail, head):
        if tail:
            first, *rest = tail
            head.append(first)
            subgroup = query_group(db, shelf_id, head)

            if not subgroup:
                subgroup = create_subgroup(parent, head[-1], "/".join(head), datetime.now())

            return do_create(subgroup, rest, head)
        else:
            return parent

    return do_create(None, name, list())


def get_group(db, shelf_id, name):
    if not name:
        return {"id": None}

    group = query_group(db, shelf_id, name)

    if group:
        return group
    else:
        return create_group(db, shelf_id, name)


def query_tag(db, user_id, name):
    rows = db((db.tag.name.upper() == name.upper()) & (db.tag.user_id == user_id)).select()

    if rows:
        return rows[0]


def create_tag(db, user_id, name):
    id = db.tag.insert(user_id=user_id, name=name)
    return {"id": id, "user_id": user_id, "name": name}


def get_tag(db, user_id, name):
    tag = query_tag(db, user_id, name)

    if tag:
        return tag
    else:
        return create_tag(db, user_id, name)


def split_path(json):
    path = json.get("path", None)

    if path:
        if path.endswith("/"):
            path = path[:-1]

        shelf, *path = [s.strip() for s in path.split("/")]

        if not shelf:
            shelf = DEFAULT_SHELF_NAME
    else:
        shelf = DEFAULT_SHELF_NAME

    return shelf, path


def split_tags(json):
    tags = json.get("tags", None)

    if tags:
        return [s.strip() for s in tags.split(",")]
    else:
        return []


def add_bookmark(db, user_id, json):
    name = json.get("name", None)
    uri = json.get("uri", None)
    icon = json.get("icon", None)

    shelf, path = split_path(json)

    shelf = get_shelf(db, user_id, shelf)
    group = get_group(db, shelf["id"], path)

    tags = [get_tag(db, user_id, t) for t in split_tags(json) if t]

    id = db.node.insert(shelf_id=shelf["id"], parent_id=group["id"], type=NODE_TYPE_BOOKMARK, name=name, uri=uri,
                        icon=icon, date_added=datetime.now())

    for t in tags:
        db.tag_to_node.insert(tag_id=t["id"], node_id=id)

    db.commit()

    return db(db.node.id == id).select()[0].as_json()


def list_nodes(db, user_id, json):
    search = json.get("search", None)
    limit = json.get("limit", DEFAULT_OUTPUT_LIMIT)
    depth = json.get("depth", "subtree")
    type = json.get("type", None)
    path = json.get("path", None)
    shelf = None
    group = None

    if path:
        shelf, path = split_path(json)

    if shelf:
        shelf = query_shelf(db, user_id, shelf)

    if path:
        group = query_group(db, shelf["id"], path)

    tags = [query_tag(db, user_id, t)["id"] for t in split_tags(json) if t]
    if tags:
        tags = "(" + ",".join([str(t) for t in tags]) + ")"

    sql = "select distinct node.*, shelf.name as shelf from node, shelf "

    if tags:
        sql += "join tag_to_node on node.id = tag_to_node.node_id "

    sql += " where node.shelf_id = shelf.id "

    if shelf:
        sql += " and shelf_id = {}".format(shelf["id"])
    else:
        sql += " and shelf_id in (select shelf.id from shelf join user on shelf.user_id = user.id where user.id = {})" \
            .format(user_id)

    if type:
        sql += " and type = {}".format(type)

    if search:
        sql += " and (upper(node.name) like upper('%{0}%') or upper(node.uri) like upper('%{0}%'))".format(search)

    if type:
        sql += " and type = {}".format(type)

    if group:
        if depth == "group":
            sql += " and parent_id = {}".format(group["id"])
        else:
            sql += " and parent_id in (with recursive subtree(i) as (select {} " \
                   " union select id from node, subtree where node.parent_id = subtree.i)" \
                   " select i from subtree)".format(group["id"])

    if tags:
        sql += " and tag_to_node.tag_id in {}".format(tags)

    sql += " limit {}".format(limit)

    #print(sql)

    rows = db.executesql(sql, as_dict=True)

    if rows:
        return serializer.dumps(rows)
    else:
        return "[]"


def list_shelves(db, user_id):
    rows = db(db.shelf.user_id == user_id).select()

    if rows:
        return rows.as_json()
    else:
        return "[]"


def list_groups(db, user_id):
    sql = "select distinct node.id, node.path, shelf.name as shelf_name " \
          "from node join shelf on node.shelf_id = shelf.id " \
          "where shelf.user_id = {} and node.type = {}".format(user_id, NODE_TYPE_GROUP)

    rows = db.executesql(sql, as_dict=True)

    if rows:
        # add shelf name for display in suggestions
        for r in rows:
            if r["shelf_name"] != DEFAULT_SHELF_NAME:
                r["path"] = r["shelf_name"] + "/" + r["path"]
            else:
                r["path"] = "/" + r["path"]

        return serializer.dumps([{"path": r["path"]} for r in rows])
    else:
        return "[]"


def list_tags(db, user_id):
    rows = db(db.tag.user_id == user_id).select()

    if rows:
        return serializer.dumps([{"name": r["name"]} for r in rows])
    else:
        return "[]"
