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


def get_user(db, name):
    rows = db(db.user.name.upper() == name.upper()).select()

    if len(rows) > 0:
        return rows[0]


def create_shelf(db, user_id, name):
    file = name + ".org"
    id = db.shelf.insert(user_id=user_id, name=name, file=file)
    #db.commit()

    return {"id": id, "user_id": user_id, "name": name, "file": file}


def get_shelf(db, user_id, name):
    if name == "":
        name = "default"

    rows = db((db.shelf.name.upper() == name.upper()) & (db.shelf.user_id == user_id)).select()

    if rows:
        return rows[0]
    else:
        return create_shelf(db, user_id, name)


def query_group(db, shelf_id, name):
    full_name = "/".join(name)
    rows = db((db.node.path.upper() == full_name.upper()) & (db.node.shelf_id == shelf_id)).select()
    if rows:
        return rows[0]


def create_group(db, shelf_id, name):
    def create_subgroup(parent, simple_name, full_name, date_added):
        parent_id = parent["id"] if parent else None
        print (full_name)
        print (parent_id)
        print (shelf_id)
        id = db.node.insert(shelf_id=shelf_id, parent_id=parent_id, type=NODE_TYPE_GROUP, name=simple_name,
                            path=full_name, date_added=date_added)
        #db.commit()
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


def create_tag(db, user_id, name):
    id = db.tag.insert(user_id=user_id, name=name)
    #db.commit()

    return {"id": id, "user_id": user_id, "name": name}


def get_tag(db, user_id, name):
    rows = db((db.tag.name.upper() == name.upper()) & (db.tag.user_id == user_id)).select()

    if rows:
        return rows[0]
    else:
        return create_tag(db, user_id, name)


def add_bookmark(db, json):
    user = json.get("user", "default")
    group = json.get("group", None)
    name = json.get("name", None)
    uri = json.get("uri", None)
    tags = json.get("tags", None)
    shelf = None

    if group:
        shelf, *group = [s.strip() for s in group.split("/")]
    else:
        shelf = "default"

    if tags:
        tags = [s.strip() for s in tags.split(",")]
    else:
        tags = []

    if user:
        user_id = get_user(db, user)["id"]
    else:
        user_id = get_user(db, "default")["id"]

    shelf = get_shelf(db, user_id, shelf)
    group = get_group(db, shelf["id"], group)
    tags = [get_tag(db, user_id, t) for t in tags if t]

    id = db.node.insert(parent_id=group["id"], type=NODE_TYPE_BOOKMARK, name=name, uri=uri, date_added=datetime.now())
    #db.commit()

    if tags:
        for t in tags:
            db.tag_to_node.insert(tag_id=t["id"], node_id=id)

    db.commit()

    print (tags)
    return ""

