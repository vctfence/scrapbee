package l2.albitron.scrapyard.cloud.db

import l2.albitron.scrapyard.Scrapyard
import l2.albitron.scrapyard.cloud.db.model.*
import l2.albitron.scrapyard.cloud.providers.CloudProvider

private const val CLOUD_SHELF_PATH = "/Cloud"
private const val CLOUD_DB_INDEX = "cloud.jsbk"

class CloudShelfDB: AbstractCloudDB, CloudDB {
    override var _provider: CloudProvider
    override var _meta: JSONScrapbookMeta

    constructor(provider: CloudProvider) {
        _provider = provider
        _meta = createTypeMeta()
    }

    override fun createTypeMeta(): JSONScrapbookMeta {
        return super.createMeta(Scrapyard.FORMAT_TYPE_CLOUD, null)
    }

    override fun getDatabaseFile(): String = CLOUD_DB_INDEX
    override fun getCloudPath(file: String): String = "${CLOUD_SHELF_PATH}/$file"
    override fun getSharingShelfUUID(): String = Scrapyard.CLOUD_SHELF_UUID

    override fun getType(): String {
        return DATABASE_TYPE
    }

    companion object {
        const val DATABASE_TYPE = "cloud"
    }
}
