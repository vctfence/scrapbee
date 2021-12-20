package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty

@JsonPropertyOrder("object", "type", "byte_length")
class Archive : JSONEntity() {
    @JsonProperty("object")
    var `object`: String? = null

    @JsonProperty("type")
    var type: String? = null

    @JsonProperty("byte_length")
    var byteLength: Long? = null
}