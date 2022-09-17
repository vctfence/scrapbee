package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty

@JsonPropertyOrder("type", "content_type")
class Archive : JSONEntity() {
    @JsonProperty("type")
    var type: String? = null

    @JsonProperty("content_type")
    var byteLength: Long? = null
}
