package l2.albitron.scrapyard.cloud.db

import android.content.Context
import l2.albitron.scrapyard.Scrapyard
import l2.albitron.scrapyard.cloud.db.model.BookmarkContent
import l2.albitron.scrapyard.cloud.db.model.Node
import l2.albitron.scrapyard.cloud.providers.CloudProvider
import java.util.ArrayList

abstract class AbstractCloudDB<T> {
    protected abstract fun deleteBookmarkAssets(node: Node)

    protected abstract fun getBookmarks(): MutableList<T>
    protected abstract fun setBookmarks(bookmarks: MutableList<T>)
    protected abstract fun accessNode(bookmark: T): Node

    protected fun findGroup(name: String, parentUUID: String): T? {
        val groupFilter = { b: T -> accessNode(b).type != null
                && accessNode(b).type == Scrapyard.NODE_TYPE_GROUP
                && parentUUID == accessNode(b).parentId
                && name.equals(accessNode(b).name, ignoreCase = true)
        }
        return getBookmarks().firstOrNull(groupFilter)
    }

    protected fun newGroupNode(name: String, parentUUID: String): Node {
        val groupNode = Node()
        groupNode.name = name
        groupNode.parentId = parentUUID
        groupNode.uuid = Scrapyard.genUUID()
        groupNode.type = Scrapyard.NODE_TYPE_GROUP
        groupNode.dateAdded = System.currentTimeMillis()
        groupNode.dateModified = groupNode.dateAdded

        return groupNode
    }

    protected fun initializeNode(node: Node, parent: Node): Node {
        node.uuid = Scrapyard.genUUID()
        node.dateAdded = System.currentTimeMillis()
        node.dateModified = node.dateAdded
        if (node.type == Scrapyard.NODE_TYPE_ARCHIVE || node.type == Scrapyard.NODE_TYPE_NOTES)
            node.contentModified = node.dateModified
        node.parentId = parent.uuid
        return node
    }

    fun deleteNode(uuid: String?) {
        val bookmarks = getBookmarks()
        val subtree = queryFullSubtree(uuid, bookmarks)
        val subtreeUUIDs: Set<String?> = subtree.map { n -> n?.uuid }.toSet()
        val subtreeFilter = { b: T -> subtreeUUIDs.contains(accessNode(b).uuid) }
        val nonSubtreeFilter = { b: T -> !subtreeUUIDs.contains(accessNode(b).uuid) }
        val subtreeBookmarks = bookmarks.filter(subtreeFilter)

        setBookmarks(bookmarks.filter(nonSubtreeFilter).toMutableList())
        for (bookmark in subtreeBookmarks)
            deleteBookmarkAssets(accessNode(bookmark))
    }

    private fun queryFullSubtree(uuid: String?, bookmarks: MutableList<T>): List<Node?> {
        val root = bookmarks.firstOrNull { uuid?.equals( accessNode(it).uuid, ignoreCase = true) == true }
        val result: MutableList<Node> = ArrayList()
        if (root != null) {
            val node = accessNode(root)
            result.add(node)
            if (node.type == Scrapyard.NODE_TYPE_SHELF || node.type == Scrapyard.NODE_TYPE_GROUP)
                getChildren(accessNode(root), bookmarks, result)
        }
        return result
    }

    private fun getChildren(node: Node, bookmarks: MutableList<T>, outNodes: MutableList<Node>) {
        val children = bookmarks.filter { node.uuid.equals(accessNode(it).parentId, ignoreCase = true) }
        for (bookmark in children) {
            val node = accessNode(bookmark)
            outNodes.add(node)
            if (node.type == Scrapyard.NODE_TYPE_SHELF || node.type == Scrapyard.NODE_TYPE_GROUP)
                getChildren(node, bookmarks, outNodes)
        }
    }

}