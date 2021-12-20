package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonProperty

class SyncNodes : JSONEntity() {
    @JsonProperty("nodes")
    var nodes: MutableList<Node>? = null
}