package l2.albitron.scrapyard.cloud;

import android.util.Base64;

import com.annimon.stream.Collectors;
import com.annimon.stream.Stream;
import com.annimon.stream.function.Predicate;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.apache.commons.text.StringEscapeUtils;
import org.apache.commons.lang3.StringUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import l2.albitron.scrapyard.Scrapyard;
import l2.albitron.scrapyard.cloud.json.Archive;
import l2.albitron.scrapyard.cloud.json.BookmarkEnvelope;
import l2.albitron.scrapyard.cloud.json.Meta;
import l2.albitron.scrapyard.cloud.json.Node;
import l2.albitron.scrapyard.cloud.json.NodeContainer;
import l2.albitron.scrapyard.cloud.json.Notes;

public class CloudDB {
    public static final String CLOUD_DB_INDEX = "index.jsonl";

    List<BookmarkEnvelope> bookmarks;
    CloudProvider provider;
    Meta meta;

    public CloudDB(CloudProvider provider) {
        this.provider = provider;
        meta = new Meta();
        meta.cloud = Scrapyard.APP_NAME;
        meta.version = Scrapyard.CLOUD_VERSION;
        meta.timestamp = System.currentTimeMillis();
        bookmarks = new ArrayList<>();
    }

    public void deserialize(String content) {
        try {
            String [] lines = content.split("\n");
            ObjectMapper objectMapper = new ObjectMapper();

            if (lines.length > 0)
                meta = objectMapper.readValue(lines[0], Meta.class);

            NodeContainer nodeContainer = null;

            if (lines.length > 1)
                nodeContainer = objectMapper.readValue(lines[1], NodeContainer.class);

            bookmarks = nodeContainer == null
                ? new ArrayList<>()
                : nodeContainer.nodes;
        }
        catch (IOException e) {
            e.printStackTrace();
        }
    }

    public String serialize() {
        meta.timestamp = System.currentTimeMillis();

        String result = null;

        try {
            ObjectMapper objectMapper = new ObjectMapper();
            String metaJSON = objectMapper.writeValueAsString(meta);

            NodeContainer nodeContainer = new NodeContainer();
            nodeContainer.nodes = bookmarks;
            String nodesJSON = objectMapper.writeValueAsString(nodeContainer);

            result = metaJSON + "\n" + nodesJSON;
        } catch (JsonProcessingException e) {
            e.printStackTrace();
        }

        return result;
    }

    protected Meta getMeta() {
        return this.meta;
    }

    public Node getOrCreateGroup(String path) {
        final String groupName =
            path.replace("/", "_").replace("\\", "_");

        Predicate<BookmarkEnvelope> groupFilter =
            b -> (b.node.type != null && b.node.type == Scrapyard.NODE_TYPE_GROUP)
                    && Scrapyard.CLOUD_SHELF_UUID.equals(b.node.parentId)
                    && StringUtils.equalsIgnoreCase(b.node.name, groupName);

        BookmarkEnvelope group = Stream.of(bookmarks).filter(groupFilter).findFirst().orElse(null);
        Node groupNode;

        if (group == null) {
            groupNode = new Node();
            groupNode.uuid = Scrapyard.getUUID();
            groupNode.type = Scrapyard.NODE_TYPE_GROUP;
            groupNode.name = groupName;
            groupNode.parentId = Scrapyard.CLOUD_SHELF_UUID;
            groupNode.external = Scrapyard.CLOUD_EXTERNAL_NAME;
            groupNode.externalId = groupNode.uuid;
            groupNode.dateAdded = System.currentTimeMillis();
            groupNode.dateModified = groupNode.dateAdded;

            group = new BookmarkEnvelope();
            group.node = groupNode;

            bookmarks.add(group);
        }
        else
            groupNode = group.node;

        return groupNode;
    }

    public Node addNode(Node node) {
        node.uuid = Scrapyard.getUUID();
        node.external = Scrapyard.CLOUD_EXTERNAL_NAME;
        node.externalId = node.uuid;

        node.dateAdded = System.currentTimeMillis();
        node.dateModified = node.dateAdded;

        BookmarkEnvelope bookmark = new BookmarkEnvelope();
        bookmark.node = node;

        bookmarks.add(bookmark);

        return node;
    }

    private void getChildren(Node node, List<Node> outNodes) {
        Predicate<BookmarkEnvelope> childFilter = b -> StringUtils.equalsIgnoreCase(b.node.parentId, node.uuid);
        List<BookmarkEnvelope> children = Stream.of(bookmarks).filter(childFilter).toList();

        for (BookmarkEnvelope bookmark : children) {
            outNodes.add(bookmark.node);
            if (bookmark.node.type == Scrapyard.NODE_TYPE_GROUP)
                getChildren(bookmark.node, outNodes);
        }
    }

    public List<Node> queryFullSubtree(String uuid) {
        Predicate<BookmarkEnvelope> rootFilter = b -> StringUtils.equalsIgnoreCase(b.node.uuid, uuid);
        BookmarkEnvelope root = Stream.of(bookmarks).filter(rootFilter).findFirst().orElse(null);

        List<Node> result = new ArrayList<>();

        if (root != null) {
            result.add(root.node);
            if (root.node.type == Scrapyard.NODE_TYPE_GROUP)
                getChildren(root.node, result);
        }

        return result;
    }

    public void deleteNode(String uuid) {
        List<Node> subtree = queryFullSubtree(uuid);
        Set<String> subtreeUUIDs = Stream.of(subtree).map(b -> b.uuid).collect(Collectors.<String>toSet());

        Predicate<BookmarkEnvelope> subtreeFilter = b -> subtreeUUIDs.contains(b.node.uuid);
        Predicate<BookmarkEnvelope> nonSubtreeFilter = b -> !subtreeUUIDs.contains(b.node.uuid);
        List<BookmarkEnvelope> subtreeBookmarks = Stream.of(bookmarks).filter(subtreeFilter).toList();
        bookmarks = Stream.of(bookmarks).filter(nonSubtreeFilter).toList();

        for (BookmarkEnvelope bookmark : subtreeBookmarks)
            deleteBookmarkAssets(bookmark.node);
    }

    private void deleteBookmarkAssets(Node node) {
        if (node.type == Scrapyard.NODE_TYPE_ARCHIVE)
            provider.deleteCloudFile(node.uuid + ".data");

        if (node.hasNotes != null && node.hasNotes) {
            provider.deleteCloudFile(node.uuid + ".notes");
            provider.deleteCloudFile(node.uuid + ".view");
        }

        if (node.hasComments != null && node.hasComments)
            provider.deleteCloudFile(node.uuid + ".comments");
    }

    public void storeBookmarkData(Node node, String text) {
        Archive archive = new Archive();
        archive.object = text;
        archive.type = "text/html";

        ObjectMapper objectMapper = new ObjectMapper();
        try {
            text = objectMapper.writeValueAsString(archive);
        } catch (JsonProcessingException e) {
            text = "";
            e.printStackTrace();
        }

        provider.writeCloudFile( node.uuid + ".data", text);
    }

    public void storeBookmarkNotes(Node node, String text) {
        Notes notes = new Notes();
        notes.content = text;
        notes.format = "text";

        String json = "";
        ObjectMapper objectMapper = new ObjectMapper();
        try {
            json = objectMapper.writeValueAsString(notes);
        } catch (JsonProcessingException e) {
            e.printStackTrace();
        }

        provider.writeCloudFile( node.uuid + ".notes", json);

        String html = "<html><head></head>"
                    + "<pre class='plaintext'>" + StringEscapeUtils.escapeHtml4(text) + "</pre></body>";
        provider.writeCloudFile( node.uuid + ".view", html);
    }

    public byte [] getArchiveBytes(String uuid) {
        String archiveJSON = provider.readCloudFile(uuid + ".data");
        byte [] result = null;

        try {
            ObjectMapper objectMapper = new ObjectMapper();
            Archive archive = objectMapper.readValue(archiveJSON, Archive.class);
            if (archive.byteLength != null)
                result = Base64.decode(archive.object, Base64.DEFAULT);
            else
                result = archive.object.getBytes(StandardCharsets.UTF_8);
        } catch (IOException e) {
            e.printStackTrace();
        }

        return result;
    }
}
