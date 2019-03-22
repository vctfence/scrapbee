import db
import PyOrgMode

import re


def import_org(user, shelf, content):
    data = db.open()

    if not user:
        user = "default"

    db_user = db.query_user(data, user)

    def import_group(path, node):
        import_nodes(path + "/" + node.heading, node.content)

    def import_link(path, node):
        match = re.search(r"\[\[([^\]]*)\]\[([^\]]*)\]\]", node.heading)
        name = match.group(2)
        uri = match.group(1)
        db.add_bookmark(data, db_user.id, {
            "name": name,
            "uri": uri,
            "path": path,
            "tags": ",".join(node.tags) if node.tags else None
        })
        print(path + "/" + name)

    def import_nodes(path, nodes):
        for n in nodes:
            if hasattr(n, "heading"):
                if n.heading.startswith("[["):
                    import_link(path, n)
                else:
                    import_group(path, n)

    if db_user:
        tree = PyOrgMode.OrgDataStructure()
        tree.load_from_string(content)
        import_nodes(shelf, tree.root.content)
    else:
        print("User '" + user + "' not found.")



