import com.sun.tools.attach.VirtualMachine;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/** Supervised by the app through stdin; owns only its local-player reader. */
public final class AutoPosition {
    private static volatile long lastPing = System.nanoTime();
    private static volatile boolean parentAlive = true;

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("Expected game PID and output path");
        long pid = Long.parseLong(args[0]);
        ProcessHandle game = ProcessHandle.of(pid).orElseThrow();
        String command = game.info().command().orElseThrow();
        if (!Path.of(command).getFileName().toString().equalsIgnoreCase("ProjectZomboid64.exe")) {
            throw new IllegalArgumentException("Target is not ProjectZomboid64");
        }
        Path output = Path.of(args[1]).toAbsolutePath();
        Files.createDirectories(output);
        Path bundle = Path.of(AutoPosition.class.getProtectionDomain().getCodeSource().getLocation().toURI()).getParent();
        Path agent = bundle.resolve(Files.readString(bundle.resolve("agent-name.txt")).trim());
        try (FileChannel channel = FileChannel.open(output.resolve("supervisor.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
             FileLock lock = channel.tryLock()) {
            if (lock == null) return;
            Thread input = new Thread(() -> {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in))) {
                    while (reader.readLine() != null) lastPing = System.nanoTime();
                } catch (Exception error) { error.printStackTrace(); }
                finally { parentAlive = false; }
            }, "pzim-parent-watch");
            input.setDaemon(true);
            input.start();
            Path lease = output.resolve("lease");
            boolean attached = false;
            long retryAt = 0;
            String lastError = "";
            try {
                Files.deleteIfExists(output.resolve("stop"));
                while (game.isAlive() && parentAlive && System.nanoTime() - lastPing < 20_000_000_000L) {
                    Files.writeString(lease, Long.toString(System.currentTimeMillis()));
                    Path status = output.resolve("status.txt");
                    boolean running = Files.exists(status) && Files.readString(status).equals("running");
                    if ((!attached || !running) && System.currentTimeMillis() >= retryAt) {
                        retryAt = System.currentTimeMillis() + 10_000;
                        try {
                            VirtualMachine vm = VirtualMachine.attach(Long.toString(pid));
                            try { vm.loadAgent(agent.toString(), "managed:" + output); }
                            finally { vm.detach(); }
                            attached = true;
                            lastError = "";
                            System.out.println("[NativePosition] attached pid=" + pid);
                        } catch (Exception error) {
                            String message = error.toString();
                            if (!message.equals(lastError)) { error.printStackTrace(); lastError = message; }
                        }
                    }
                    Thread.sleep(2000);
                }
            } finally {
                Files.deleteIfExists(lease);
            }
        }
    }
}
