package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonProperty

class CloudShelfNodes : JSONEntity() {
    @JsonProperty("nodes")
    var nodes: MutableList<BookmarkContent>? = null
}