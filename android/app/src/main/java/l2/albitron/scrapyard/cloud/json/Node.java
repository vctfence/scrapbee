package l2.albitron.scrapyard.cloud.json;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonPropertyOrder({
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
})
public class Node extends JSONEntity {
    @JsonProperty("name")
    public String name;
    @JsonProperty("uri")
    public String uri;
    @JsonProperty("tags")
    public String tags;
    @JsonProperty("icon")
    public String icon;
    @JsonProperty("parent_id")
    public String parentId;
    @JsonProperty("type")
    public Long type;
    @JsonProperty("pos")
    public Long pos;
    @JsonProperty("date_added")
    public Long dateAdded;
    @JsonProperty("date_modified")
    public Long dateModified;
    @JsonProperty("content_modified")
    public Long contentModified;
    @JsonProperty("uuid")
    public String uuid;
    @JsonProperty("todo_state")
    public Long todoState;
    @JsonProperty("details")
    public String details;
    @JsonProperty("todo_date")
    public String todoDate;
    @JsonProperty("has_notes")
    public Boolean hasNotes;
    @JsonProperty("has_comments")
    public Boolean hasComments;
    @JsonProperty("content_type")
    public String contentType;
    @JsonProperty("external")
    public String external;
    @JsonProperty("external_id")
    public String externalId;
}

