package l2.albitron.scrapyard.cloud.json;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonPropertyOrder({"content", "format"})
public class Notes extends JSONEntity {
    @JsonProperty("content")
    public String content;
    @JsonProperty("format")
    public String format;
}
