import json as serializer

import config

from pydal import DAL, Field
from datetime import datetime

NODE_TYPE_SHELF = 1
NODE_TYPE_GROUP = 2
NODE_TYPE_BOOKMARK = 3
NODE_TYPE_ARCHIVE = 4
NODE_TYPE_SEPARATOR = 5

DEFAULT_SHELF_NAME = "default"


def open():
    db = DAL('sqlite://' + config.SCRAPYARD_INDEX_PATH, migrate_enabled=False)
    
    db.define_table('user', Field('id', type='integer'), Field('name'), Field('sid'))
    db.define_table('node', Field('id', type='integer'), Field('uuid', type='text'), Field('type', type='integer'),
                    Field('user_id', type='integer'), Field('name'), Field('uri'), Field('path'), Field('icon'),
                    Field('pos', type='integer'), Field('parent_id'), Field('date_added', 'datetime'),
                    Field('todo_state', type='integer'), Field('todo_date', 'datetime'), Field('details'))
    db.define_table('attachment', Field('id', type='integer'), Field('node_id', type='integer'),
                    Field('uuid', type='text'), Field('name'))
    db.define_table('tag', Field('id', type='integer'), Field('user_id', type='integer'), Field('name'))
    db.define_table('tag_to_node', Field('tag_id', type='integer'), Field('node_id', type='integer'))

    return db


def obj(dict):
    return type('', (), dict)()


def only(list):
    return list[0] if len(list) > 0 else None


def normalize(path):
    if path.startswith("/"):
        return DEFAULT_SHELF_NAME + path
    else:
        return path


def select_all_children_of(node_id):
    return " (with recursive subtree(i) as (select {} " \
           " union select id from node, subtree where node.parent_id = subtree.i)" \
           " select i from subtree)".format(node_id)


def split_path(path):
    """ Correctly splits shelf name from the rest of the path, returns 'default' shelf for path, starging with '/' """
    if path:
        if path.endswith("/"):
            path = path[:-1]

        shelf, *path = [s.strip() for s in path.split("/")]

        if not shelf:
            shelf = DEFAULT_SHELF_NAME
    else:
        shelf = DEFAULT_SHELF_NAME
        path = []

    return shelf, path


def split_tags(json):
    tags = json.get("tags", None)

    if tags:
        return [s.strip() for s in tags.split(",")]
    else:
        return []


def rename_existing(db, node, dest_id):
    """ Adds '(N)' to a name if one already exists under dest_id """
    children = db(db.node.parent_id == dest_id).select()
    original = node["name"]
    existing = [e["name"] for e in children if e["name"].upper() == original.upper()]

    n = 1
    while existing:
        node["name"] = original + " (" + str(n) + ")"
        n += 1
        existing = [e["name"] for e in children if e["name"].upper() == node["name"].upper()]


def query_user(db, name):
    rows = db(db.user.name.upper() == name.upper()).select()

    if len(rows) > 0:
        return rows[0]


def query_shelf(db, user_id, name):
    if not name:
        name = DEFAULT_SHELF_NAME

    shelf = db((db.node.name.upper() == name.upper()) & (db.node.user_id == user_id)
               & (db.node.type == NODE_TYPE_SHELF)).select()

    return only(shelf)


def create_shelf(db, user_id, name):
    id = db.node.insert(user_id=user_id, type=NODE_TYPE_SHELF, name=name, path=name, date_added=datetime.now())

    return only(db(db.node.id == id).select())


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
        return shelf.as_json()
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
            old_name = shelf.name
            shelf.name = new_name
            shelf.path = new_name
            shelf.update_record()

            sql = "update node set path = '{0}' || substr(path, {1}) where type = {2}"
            sql += " and parent_id in " + select_all_children_of(shelf.id)

            db.executesql(sql.format(shelf.name, len(old_name) + 1, NODE_TYPE_GROUP))

            db.commit()
            return "{}"

    return ""


# for use in CRUD API
def delete_shelf(db, user_id, json):
    name = json.get("name", None)

    if not name or name == DEFAULT_SHELF_NAME:
        return ""

    shelf = query_shelf(db, user_id, name)

    if shelf:
        shelf.delete_record()
        db.commit()

    return "{}"


def query_group(db, user_id, path):
    if path:
        path = normalize(path)
        group = db((db.node.path.upper() == path.upper()) & (db.node.user_id == user_id)).select()
        return only(group)


def create_group(db, user_id, path):
    shelf, path_list = split_path(path)
    shelf = get_shelf(db, user_id, shelf)

    def create_subgroup(parent, name, path, date_added):
        id = db.node.insert(user_id=user_id, parent_id=parent.id, type=NODE_TYPE_GROUP, name=name,
                            path=path, date_added=date_added)
        return only(db(db.node.id == id).select())

    def do_create(parent, tail, head):
        if tail:
            first, *rest = tail
            head.append(first)
            group_path = shelf.name + "/" + "/".join(head)
            subgroup = query_group(db, user_id, group_path)

            if not subgroup:
                subgroup = create_subgroup(parent, head[-1], group_path, datetime.now())

            return do_create(subgroup, rest, head)
        else:
            return parent

    return do_create(shelf, path_list, list())


def get_group(db, user_id, path):
    if not path:
        return obj({"id": None})

    group = query_group(db, user_id, path)

    if group:
        return group
    else:
        return create_group(db, user_id, path)


def unique_path(db, user_id, path):
    path_list = path.split("/")

    dest_group = query_group(db, user_id, "/".join(path_list[:-1]))
    dest_id = dest_group.id if dest_group else None
    if dest_id:
        group = {"name": path_list[-1]}
        rename_existing(db, group, dest_id)
        path_list = path_list[:-1] + [group["name"]]
        return "/".join(path_list)
    else:
        return path


# for use in CRUD API
def new_group(db, user_id, json):
    path = json.get("path", None)
    group = get_group(db, user_id, unique_path(db, user_id, path))

    if group:
        db.commit()
        return only(db(db.node.id == group.id).select()).as_json()
    else:
        return ""


# for use in CRUD API
def rename_group(db, user_id, json):
    path = json.get("path", None)
    new_name = json.get("new_name", None)

    if not path or not new_name:
        return ""

    path_list = normalize(path).split("/")
    group = query_group(db, user_id, path)

    if group:
        old_path = group.path
        new_path = unique_path(db, user_id, "/".join(path_list[:-1] + [new_name]))

        group.name = new_path.split("/")[-1]
        group.path = new_path
        group.update_record()
        sql = "update node set path = '{0}' || substr(path, {1}) where type = {2}"
        sql += " and parent_id in " + select_all_children_of(group.id)

        db.executesql(sql.format(group.path, len(old_path) + 1, NODE_TYPE_GROUP))

        db.commit()
        return group.as_json()

    return ""


# for use in CRUD API
def delete_group(db, user_id, json):
    path = json.get("path", None)

    if not path:
        return ""

    group = query_group(db, user_id, path)

    if group:
        group.delete_record()
        db.commit()

    return "{}"


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


def add_separator(db, user_id, json):
    uuid = json.get("parent", None)

    if uuid:
        parent = only(db(db.node.uuid == uuid).select())

        if parent:
            id = db.node.insert(user_id=user_id, parent_id=parent.id, type=NODE_TYPE_SEPARATOR, name="-",
                                date_added=datetime.now())
            db.commit()

            return db(db.node.id == id).select()[0].as_json()

    return ""


def add_bookmark(db, user_id, json, commit=True):
    name = json.get("name", None)
    path = json.get("path", None)
    uri = json.get("uri", None)
    icon = json.get("icon", None)
    details = json.get("details", None)
    todo_date = json.get("todo_date", None)

    group = get_group(db, user_id, path)

    tags = [get_tag(db, user_id, t) for t in split_tags(json) if t]

    id = db.node.insert(user_id=user_id, parent_id=group["id"], type=NODE_TYPE_BOOKMARK, name=name, uri=uri,
                        icon=icon, date_added=datetime.now(), details=details, todo_date=todo_date)

    for t in tags:
        db.tag_to_node.insert(tag_id=t["id"], node_id=id)

    if commit:
        db.commit()

    return db(db.node.id == id).select()[0].as_json()


def update_bookmark(db, user_id, json):
    uuid = json.get("uuid", None)
    name = json.get("name", None)
    uri = json.get("uri", None)
    details = json.get("details", None)
    todo_date = json.get("todo_date", None)

    bookmark = db(db.node.uuid == uuid).select()
    bookmark = bookmark[0] if bookmark else None

    tags = [get_tag(db, user_id, t) for t in split_tags(json) if t]

    for t in tags:
        db.tag_to_node.insert(tag_id=t["id"], node_id=bookmark.id)

    if bookmark:
        bookmark.name = name
        bookmark.uri = uri
        bookmark.tags = tags
        bookmark.details = details
        if todo_date:
            try:
                bookmark.todo_date = todo_date
            except:
                pass
        bookmark.update_record()
        db.commit()

    return "{}"


def list_nodes(db, user_id, json):
    search = json.get("search", None)
    limit = json.get("limit", None)
    depth = json.get("depth", "subtree")
    type = json.get("type", None)
    path = json.get("path", None)
    order = json.get("order", None)

    group = query_group(db, user_id, path)

    tags = [query_tag(db, user_id, t)["id"] for t in split_tags(json) if t]
    if tags:
        tags = "(" + ",".join([str(t) for t in tags]) + ")"

    if group and depth == "root+subtree":
        sql = "select distinct * from node where id = {} union ".format(group["id"])
    else:
        sql = ""

    sql += "select distinct * from node "

    if tags:
        sql += "join tag_to_node on node.id = tag_to_node.node_id "

    sql += " where node.user_id = {} ".format(user_id)

    if type:
        sql += " and type = {}".format(type)

    if search:
        search = search.replace("'", "\\'").replace("_", "\\_").replace("%", "\\%").replace("*", "%")
        sql += " and (upper(node.name) like upper('%{0}%') or upper(node.uri) like upper('%{0}%'))".format(search)

    if group:
        if depth == "group":
            sql += " and parent_id = {}".format(group["id"])
        else:
            sql += " and parent_id in " + select_all_children_of(group["id"])

    if tags:
        sql += " and tag_to_node.tag_id in {}".format(tags)

    if order == "custom":
        sql += " order by pos "

    if limit:
        sql += " limit {}".format(limit)

    #print(sql)

    rows = db.executesql(sql, as_dict=True)

    if rows:
        return serializer.dumps(rows, default=str)
    else:
        return "[]"


def list_shelves(db, user_id):
    rows = db((db.node.user_id == user_id) & (db.node.type == NODE_TYPE_SHELF)).select()

    if rows:
        return rows.as_json()
    else:
        return "[]"


def list_groups(db, user_id):
    sql = "select distinct id, path from node " \
          "where user_id = {} and type = {}".format(user_id, NODE_TYPE_GROUP)

    rows = db.executesql(sql, as_dict=True)

    if rows:
        # add shelf name for display in suggestions
        for r in rows:
            if r["path"].startswith(DEFAULT_SHELF_NAME):
                r["path"] = r["path"][len(DEFAULT_SHELF_NAME):]

        return serializer.dumps([{"path": r["path"]} for r in rows])
    else:
        return "[]"


def list_tags(db, user_id):
    rows = db(db.tag.user_id == user_id).select()

    if rows:
        return serializer.dumps([{"name": r["name"]} for r in rows])
    else:
        return "[]"


def copy_nodes(db, user_id, json):
    nodes = json.get("nodes", None)
    dest = json.get("dest", None)

    if nodes and dest:
        result = []

        dest_node = db(db.node.uuid == dest).select()[0]

        def do_copy(node, parent):
            children = db(db.node.parent_id == node.id).select()

            del node["id"]
            del node["uuid"]
            node["parent_id"] = parent.id

            if node.type == NODE_TYPE_GROUP:
                node["path"] = parent["path"] + "/" + node["name"]

            id = db["node"].insert(**node)
            new_node = db(db.node.id == id).select()[0]

            result.append(new_node)

            if children:
                for c in children:
                    do_copy(c, new_node)

        for n in db(db.node.uuid.belongs(nodes)).select():
            rename_existing(db, n, dest_node.id)
            do_copy(n, dest_node)

        db.commit()
        return "[" + ",".join([n.as_json() for n in result]) + "]"

    return ""


def move_nodes(db, user_id, json):
    nodes = json.get("nodes", None)
    dest = json.get("dest", None)

    if nodes and dest:
        result = []

        dest_node = db(db.node.uuid == dest).select()[0]

        def do_move(node, parent):
            node["parent_id"] = parent["id"]

            if node.type == NODE_TYPE_GROUP:
                node["path"] = parent["path"] + "/" + node["name"]

            node.update_record()

            result.append(node)

            children = db(db.node.parent_id == node.id).select()
            if children:
                for c in children:
                    do_move(c, node)

        for n in db(db.node.uuid.belongs(nodes)).select():
            rename_existing(db, n, dest_node.id)
            do_move(n, dest_node)

        db.commit()
        return "[" + ",".join([n.as_json() for n in result]) + "]"

    return ""


def delete_nodes(db, user_id, json):
    nodes = json.get("nodes", None)

    if nodes:
        for n in db(db.node.uuid.belongs(nodes)).select():
            try:
                sql = "select * from attachment where node_id in " + select_all_children_of(n.id)

                attachments = db.executesql(sql)

                for a in attachments:
                    pass

                n.delete_record()
            except Exception as e:
                print(e)

            db.commit()

        return "{}"

    return ""


def todo_nodes(db, user_id, json):
    nodes = json.get("nodes", None)

    if nodes:
        for n in db(db.node.uuid.belongs(list(nodes.keys()))).select():
            if n.type == NODE_TYPE_GROUP:
                try:
                    sql = "update node set todo_state = {} where parent_id in ".format(nodes[n.uuid]) \
                          + select_all_children_of(n.id)
                    db.executesql(sql)
                except Exception as e:
                    print(e)
            else:
                n.todo_state = nodes[n.uuid]
                n.update_record()

        db.commit()
        return "{}"

    return ""


def reorder_nodes(db, user_id, json):
    nodes = json.get("nodes", None)

    if nodes:
        for n in db(db.node.uuid.belongs(list(nodes.keys()))).select():
                n.pos = nodes[n.uuid]
                n.update_record()

        db.commit()
        return "{}"

    return ""
