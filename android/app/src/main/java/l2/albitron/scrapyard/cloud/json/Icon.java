package l2.albitron.scrapyard.cloud.json;

import com.fasterxml.jackson.annotation.JsonProperty;

public class Icon extends JSONEntity {
    @JsonProperty("data_url")
    public String dataURL;
}
