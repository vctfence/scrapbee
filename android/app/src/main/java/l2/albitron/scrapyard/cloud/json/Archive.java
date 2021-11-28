package l2.albitron.scrapyard.cloud.json;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonPropertyOrder({"object", "type", "byte_length"})
public class Archive extends JSONEntity {
    @JsonProperty("object")
    public String object;
    @JsonProperty("type")
    public String type;
    @JsonProperty("byte_length")
    public Long byteLength;
}
