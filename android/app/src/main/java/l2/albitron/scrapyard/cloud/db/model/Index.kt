package l2.albitron.scrapyard.cloud.db.model;

import com.fasterxml.jackson.annotation.JsonProperty;

class Index : JSONEntity() {
    @JsonProperty("content")
    var content: List<String>? = null
}
