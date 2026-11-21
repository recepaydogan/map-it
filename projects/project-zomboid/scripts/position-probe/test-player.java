package zombie.characters;

/** Fixture for the attach integration test; never packaged into the agent. */
public final class IsoPlayer {
    private static final IsoPlayer PLAYER = new IsoPlayer();
    private static volatile boolean available;
    public static IsoPlayer getInstance() { return available ? PLAYER : null; }
    public float getX() { return 1234.5f; }
    public float getY() { return 6789.25f; }
    public int getZ() { return 2; }
    public float getForwardDirectionX() { return 3; }
    public float getForwardDirectionY() { return -4; }
    public static void main(String[] args) throws Exception {
        Thread.sleep(3000);
        available = true;
        Thread.sleep(30000);
    }
}
