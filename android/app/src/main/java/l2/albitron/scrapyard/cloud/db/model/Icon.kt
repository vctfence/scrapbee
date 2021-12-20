package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonProperty

class Icon : JSONEntity() {
    @JsonProperty("data_url")
    var dataURL: String? = null
}