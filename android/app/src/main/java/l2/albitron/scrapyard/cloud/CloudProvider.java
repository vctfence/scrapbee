package l2.albitron.scrapyard.cloud;

public interface CloudProvider {
    CloudDB getDB();
    CloudDB getEmptyDB();
    void persistDB(CloudDB db) throws Exception;
    String readCloudFile(String file);
    void writeCloudFile(String file, String content);
    void deleteCloudFile(String file);
}
