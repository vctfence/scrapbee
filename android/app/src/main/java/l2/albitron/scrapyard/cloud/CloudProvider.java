package l2.albitron.scrapyard.cloud;

public interface CloudProvider {
   CloudDB getDB();
   void persistDB(CloudDB db) throws Exception;
}
