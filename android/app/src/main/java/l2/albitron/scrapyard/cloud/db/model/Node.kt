package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonPropertyOrder
import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.annotation.JsonInclude

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder(
    "name",
    "uuid",
    "uri",
    "pos",
    "icon",
    "parent_id",
    "type",
    "tags",
    "date_added",
    "date_modified",
    "content_modified",
    "todo_state",
    "details",
    "todo_date",
    "has_notes",
    "has_comments",
    "content_type",
    "byte_length",
    "external",
    "external_id"
)
class Node : JSONEntity() {
    @JsonProperty("name")
    var name: String? = null

    @JsonProperty("uri")
    var uri: String? = null

    @JsonProperty("tags")
    var tags: String? = null

    @JsonProperty("icon")
    var icon: String? = null

    @JsonProperty("parent_id")
    var parentId: String? = null

    @JsonProperty("type")
    var type: Long? = null

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
    var todoState: Long? = null

    @JsonProperty("details")
    var details: String? = null

    @JsonProperty("todo_date")
    var todoDate: String? = null

    @JsonProperty("has_notes")
    var hasNotes: Boolean? = null

    @JsonProperty("has_comments")
    var hasComments: Boolean? = null

    @JsonProperty("content_type")
    var contentType: String? = null

    @JsonProperty("external")
    var external: String? = null

    @JsonProperty("external_id")
    var externalId: String? = null
}