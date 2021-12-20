package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty

@JsonPropertyOrder("cloud", "version", "timestamp")
class CloudShelfMeta : JSONEntity() {
    @JsonProperty("cloud")
    var cloud: String? = null

    @JsonProperty("version")
    var version: Long? = null

    @JsonProperty("timestamp")
    var timestamp: Long? = null
}