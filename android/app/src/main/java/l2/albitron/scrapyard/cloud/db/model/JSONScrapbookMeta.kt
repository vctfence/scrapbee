package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty

@JsonPropertyOrder("format", "version", "type", "contains", "uuid", "entities", "timestamp", "date")
class JSONScrapbookMeta: JSONEntity() {
    @JsonProperty("format")
    var format: String? = null

    @JsonProperty("version")
    var version: Long? = null

    @JsonProperty("type")
    var type: String? = null

    @JsonProperty("contains")
    var contains: String? = null

    @JsonProperty("uuid")
    var uuid: String? = null

    @JsonProperty("entities")
    var entities: Long? = null

    @JsonProperty("timestamp")
    var timestamp: Long? = null

    @JsonProperty("date")
    var date: String? = null
}
