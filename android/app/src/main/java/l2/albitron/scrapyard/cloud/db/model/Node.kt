package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonInclude

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder(
    "type",
    "uuid",
    "parent",
    "title",
    "url",
    "content_type",
    "archive_type",
    "size",
    "tags",
    "date_added",
    "date_modified",
    "content_modified",
    "external",
    "external_id",
    "stored_icon",
    "has_comments",
    "has_notes",
    "todo_state",
    "todo_date",
    "details",
    "pos"
)
class Node : JSONEntity() {
    @JsonProperty("title")
    var title: String? = null

    @JsonProperty("url")
    var url: String? = null

    @JsonProperty("tags")
    var tags: String? = null

    @JsonProperty("icon")
    var icon: String? = null

    @JsonProperty("parent")
    var parent: String? = null

    @JsonProperty("type")
    var type: String? = null

    @JsonProperty("archive_type")
    var archiveType: String? = null

    @JsonProperty("pos")
    var pos: Long? = null

    @JsonProperty("date_added")
    var dateAdded: Long? = null

    @JsonProperty("date_modified")
    var dateModified: Long? = null

    @JsonProperty("content_modified")
    var contentModified: Long? = null

    @JsonProperty("uuid")
    var uuid: String? = null

    @JsonProperty("todo_state")
    var todoState: String? = null

    @JsonProperty("details")
    var details: String? = null

    @JsonProperty("has_notes")
    var hasNotes: Boolean? = null

    @JsonProperty("has_icon")
    var hasIcon: Boolean? = null

    @JsonProperty("content_type")
    var contentType: String? = null
}

