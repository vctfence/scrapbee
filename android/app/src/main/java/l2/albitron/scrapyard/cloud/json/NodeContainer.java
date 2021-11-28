package l2.albitron.scrapyard.cloud.json;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public class NodeContainer extends JSONEntity {
    @JsonProperty("nodes")
    public List<BookmarkEnvelope> nodes;
}
