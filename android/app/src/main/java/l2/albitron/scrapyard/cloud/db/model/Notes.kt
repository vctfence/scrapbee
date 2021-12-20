package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty

@JsonPropertyOrder("content", "format")
class Notes : JSONEntity() {
    @JsonProperty("content")
    var content: String? = null

    @JsonProperty("format")
    var format: String? = null
}