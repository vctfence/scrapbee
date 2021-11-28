package l2.albitron.scrapyard.cloud.json;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({"node", "icon"})
public class BookmarkEnvelope extends JSONEntity {
    @JsonProperty("node")
    public Node node;
    @JsonProperty("icon")
    public Icon icon;
}
