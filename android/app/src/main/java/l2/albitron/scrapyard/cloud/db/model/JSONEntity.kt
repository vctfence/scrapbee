package l2.albitron.scrapyard.cloud.db.model

import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonAnyGetter
import com.fasterxml.jackson.annotation.JsonAnySetter
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import java.util.HashMap

@JsonInclude(JsonInclude.Include.NON_NULL)
open class JSONEntity {
    @JsonIgnore
    private var _additionalProperties: MutableMap<String, Any> = HashMap()

    @JsonAnyGetter
    fun getAdditionalProperties(): Map<String, Any> {
        return _additionalProperties
    }

    @JsonAnySetter
    fun setAdditionalProperty(name: String, value: Any) {
        _additionalProperties[name] = value
    }

    fun toJSON(): String {
        val objectMapper = ObjectMapper()
        return objectMapper.writeValueAsString(this)
    }
}

inline fun <reified T: Any> String.fromJSON(): T {
    val objectMapper = ObjectMapper()
    return objectMapper.readValue(this, T::class.java)
}