import json as serializer

import config

from pydal import DAL, Field
from datetime import datetime


NODE_TYPE_GROUP = 1
NODE_TYPE_BOOKMARK = 2
NODE_TYPE_ARCHIVE = 3


def open():
    db = DAL('sqlite://' + config.SCRAPYARD_INDEX_PATH, migrate_enabled=False)
    
    db.define_table('user', Field('id', type='integer'), Field('name'), Field('sid'))
    db.define_table('shelf', Field('id', type='integer'), Field('user_id', type='integer'), Field('name'),
                    Field('file'))
    db.define_table('node', Field('id', type='integer'), Field('uuid', type='text'), Field('type', type='integer'),
                    Field('shelf_id', type='integer'), Field('name'), Field('uri'), Field('path'),
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
        name = "default"

    rows = db((db.shelf.name.upper() == name.upper()) & (db.shelf.user_id == user_id)).select()

    if rows:
        return rows[0]


def create_shelf(db, user_id, name):
    file = name + ".org"
    id = db.shelf.insert(user_id=user_id, name=name, file=file)

    return {"id": id, "user_id": user_id, "name": name, "file": file}


def get_shelf(db, user_id, name):
    shelf = query_shelf(db, user_id, name)

    if shelf:
        return shelf
    else:
        return create_shelf(db, user_id, name)


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
        return {id: None}

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
        shelf, *path = [s.strip() for s in path.split("/")]
    else:
        shelf = "default"

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

    shelf, path = split_path(json)
    shelf = get_shelf(db, user_id, shelf)
    group = get_group(db, shelf["id"], path)

    tags = [get_tag(db, user_id, t) for t in split_tags(json) if t]

    id = db.node.insert(shelf_id=shelf["id"], parent_id=group["id"], type=NODE_TYPE_BOOKMARK, name=name, uri=uri,
                        date_added=datetime.now())

    for t in tags:
        db.tag_to_node.insert(tag_id=t["id"], node_id=id)

    db.commit()

    return ""


def list_nodes(db, user_id, json):
    type = json.get("type", None)
    shelf, path = split_path(json)

    shelf = query_shelf(db, user_id, shelf)
    group = query_group(db, shelf["id"], path)

    tags = [query_tag(db, user_id, t)["id"] for t in split_tags(json) if t]
    if tags:
        tags = "(" + ",".join([str(t) for t in tags]) + ")"

    sql = "select distinct node.* from node "

    if tags:
        sql += "join tag_to_node on node.id = tag_to_node.node_id "

    sql += " where shelf_id = {}".format(shelf["id"])

    if type:
        sql += " and type = {}". format(type)

    if group:
        sql += " and parent_id = {}". format(group["id"])

    if tags:
        sql += " and tag_to_node.tag_id in {}". format(tags)

    rows = db.executesql(sql, as_dict=True)

    if rows:
        return serializer.dumps(rows)
    else:
        return "[]"


def list_tags(db, user_id):
    rows = db(db.tag.user_id == user_id).select()

    if rows:
        return rows.as_json()
    else:
        return "[]"
