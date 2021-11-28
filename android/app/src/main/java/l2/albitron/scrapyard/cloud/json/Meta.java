package l2.albitron.scrapyard.cloud.json;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonPropertyOrder({"cloud", "version", "timestamp"})
public class Meta extends JSONEntity {
    @JsonProperty("cloud")
    public String cloud;
    @JsonProperty("version")
    public Long version;
    @JsonProperty("timestamp")
    public Long timestamp;
}
