package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonPropertyOrder

@JsonPropertyOrder("sync", "version", "entities", "timestamp", "date")
class SyncMeta : JSONEntity() {
    @JsonProperty("sync")
    var sync: String? = null

    @JsonProperty("version")
    var version: Long? = null

    @JsonProperty("entities")
    var entities: Long? = null

    @JsonProperty("timestamp")
    var timestamp: Long? = null

    @JsonProperty("date")
    var date: String? = null
}