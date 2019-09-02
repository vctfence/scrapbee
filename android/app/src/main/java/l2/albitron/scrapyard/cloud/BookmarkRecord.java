package l2.albitron.scrapyard.cloud;

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
    "id",
    "name",
    "uuid",
    "uri",
    "pos",
    "icon",
    "parent_id",
    "type",
    "tags",
    "tag_list",
    "date_added",
    "todo_state",
    "details",
    "todo_date",
    "has_notes",
    "date_modified",
    "notes_format",
    "content_type",
    "byte_length",
    "external",
    "external_id",
    "cloud",
    "date",
    "next_id"
})
public class BookmarkRecord {

    @JsonProperty("name")
    public String name;
    @JsonProperty("uri")
    public String uri;
    @JsonProperty("tags")
    public String tags;
    @JsonProperty("icon")
    public String icon;
    @JsonProperty("parent_id")
    public Long parentId;
    @JsonProperty("type")
    public Long type;
    @JsonProperty("tag_list")
    public List<String> tagList = null;
    @JsonProperty("pos")
    public Long pos;
    @JsonProperty("date_added")
    public Long dateAdded;
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
    @JsonProperty("date_modified")
    public Long dateModified;
    @JsonProperty("id")
    public Long id;
    @JsonProperty("notes_format")
    public String notesFormat;
    @JsonProperty("content_type")
    public String contentType;
    @JsonProperty("byte_length")
    public Long byteLength;
    @JsonProperty("external")
    public String external;
    @JsonProperty("external_id")
    public String externalId;
    @JsonProperty("cloud")
    public String cloud;
    @JsonProperty("date")
    public Long date;
    @JsonProperty("next_id")
    public Long nextId;

    @JsonIgnore
    public Map<String, Object> additionalProperties = new HashMap<String, Object>();

    @JsonAnyGetter
    public Map<String, Object> getAdditionalProperties() {
        return this.additionalProperties;
    }

    @JsonAnySetter
    public void setAdditionalProperty(String name, Object value) {
        this.additionalProperties.put(name, value);
    }
}

