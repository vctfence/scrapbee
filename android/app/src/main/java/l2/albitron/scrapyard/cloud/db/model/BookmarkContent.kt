package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonInclude

@JsonPropertyOrder("node", "icon")
class BookmarkContent : JSONEntity() {
    @JsonProperty("node")
    var node: Node? = null

    @JsonProperty("icon")
    var icon: Icon? = null

    @JsonProperty("archive")
    var archive: Archive? = null

    @JsonProperty("notes")
    var notes: Notes? = null
}