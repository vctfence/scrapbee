package l2.albitron.scrapyard

import java.util.*

interface Scrapyard {
    companion object {
        val FORMAT_NAME: String = "Scrapyard"
        const val SYNC_VERSION: Long = 1
        const val CLOUD_VERSION: Long = 1
        const val NODE_TYPE_SHELF: Long = 1
        const val NODE_TYPE_GROUP: Long = 2
        const val NODE_TYPE_BOOKMARK: Long = 3
        const val NODE_TYPE_ARCHIVE: Long = 4
        const val NODE_TYPE_SEPARATOR: Long = 5
        const val NODE_TYPE_NOTES: Long = 6
        const val DEFAULT_SHELF_UUID = "1"
        const val CLOUD_SHELF_UUID = "cloud"
        const val CLOUD_EXTERNAL_NAME = "cloud"
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