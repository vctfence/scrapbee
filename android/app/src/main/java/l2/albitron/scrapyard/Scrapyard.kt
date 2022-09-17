package l2.albitron.scrapyard

import java.util.*

interface Scrapyard {
    companion object {
        const val FORMAT_NAME: String = "JSON Scrapbook"
        const val FORMAT_VERSION: Long = 1
        const val FORMAT_TYPE_CLOUD: String = "cloud"
        const val FORMAT_TYPE_INDEX: String = "index"
        const val FORMAT_CONTAINS_SHELF: String = "shelf"
        const val FORMAT_CONTAINS_EVERYTHING = "everything"
        const val ARCHIVE_CONTAINS_FILES: String = "files"
        const val NODE_TYPE_SHELF: String = "shelf"
        const val NODE_TYPE_FOLDER: String = "folder"
        const val NODE_TYPE_BOOKMARK: String = "bookmark"
        const val NODE_TYPE_ARCHIVE: String = "archive"
        const val NODE_TYPE_SEPARATOR: String = "separator"
        const val NODE_TYPE_NOTES: String = "notes"
        const val NOTES_FORMAT_TEXT: String = "text"
        const val ARCHIVE_TYPE_TEXT: String = "text"
        const val DEFAULT_SHELF_UUID = "default"
        const val CLOUD_SHELF_UUID = "cloud"
        const val CLOUD_EXTERNAL_TYPE = "cloud"
        const val DEFAULT_POSITION = 2147483647L
        const val TODO_STATE_TODO: Long = 1
        const val TODO_STATE_DONE: Long = 4
        const val TODO_STATE_WAITING: Long = 2
        const val TODO_STATE_POSTPONED: Long = 3
        const val TODO_STATE_CANCELLED: Long = 5

        fun genUUID(): String {
            return UUID.randomUUID()
                .toString()
                .replace("-", "")
                .uppercase()
        }
    }
}
