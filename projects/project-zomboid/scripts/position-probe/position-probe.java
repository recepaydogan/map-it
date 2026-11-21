import java.lang.instrument.Instrumentation;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;

/** A bounded, read-only experiment. No transformations or game state writes. */
public final class PositionProbe {
    private static Thread worker;

    public static synchronized void agentmain(String options, Instrumentation instrumentation) throws Exception {
        if (worker != null && worker.isAlive()) return;
        boolean managed = options.startsWith("managed:");
        Path output = Path.of(managed ? options.substring(8) : options).toAbsolutePath();
        Files.createDirectories(output);
        Class<?> playerClass = null;
        for (Class<?> candidate : instrumentation.getAllLoadedClasses()) {
            if (candidate.getName().equals("zombie.characters.IsoPlayer")) {
                playerClass = candidate;
                break;
            }
        }
        if (playerClass == null) throw new IllegalStateException("IsoPlayer is not loaded; enter a world first");
        Method instance = playerClass.getMethod("getInstance");
        Method x = playerClass.getMethod("getX");
        Method y = playerClass.getMethod("getY");
        Method z = playerClass.getMethod("getZ");
        Method facingX = playerClass.getMethod("getForwardDirectionX");
        Method facingY = playerClass.getMethod("getForwardDirectionY");
        Files.deleteIfExists(output.resolve("stop"));
        Files.deleteIfExists(output.resolve("error.txt"));
        Files.deleteIfExists(output.resolve("position.json"));
        Files.writeString(output.resolve("status.txt"), "running", StandardCharsets.UTF_8);
        worker = new Thread(() -> sample(output, instance, x, y, z, facingX, facingY, managed), "pzim-position-probe");
        worker.setDaemon(true);
        worker.start();
    }

    private static void sample(Path output, Method instance, Method x, Method y, Method z, Method facingX, Method facingY, boolean managed) {
        long deadline = System.nanoTime() + 120_000_000_000L;
        long sequence = 0;
        try {
            while ((managed ? leaseAlive(output) : System.nanoTime() < deadline) && !Files.exists(output.resolve("stop"))) {
                Object player = instance.invoke(null);
                if (player != null) {
                    double px = ((Number) x.invoke(player)).doubleValue();
                    double py = ((Number) y.invoke(player)).doubleValue();
                    double pz = ((Number) z.invoke(player)).doubleValue();
                    double dx = ((Number) facingX.invoke(player)).doubleValue();
                    double dy = ((Number) facingY.invoke(player)).doubleValue();
                    if (!Double.isFinite(px) || !Double.isFinite(py) || !Double.isFinite(pz)) {
                        throw new IllegalStateException("Non-finite player coordinates");
                    }
                    if (!Double.isFinite(dx) || !Double.isFinite(dy)) {
                        throw new IllegalStateException("Non-finite player facing");
                    }
                    double length = Math.hypot(dx, dy);
                    if (length > 0) { dx /= length; dy /= length; }
                    String json = String.format(Locale.ROOT,
                        "{\"version\":1,\"sequence\":%d,\"updatedAt\":%d,\"x\":%.3f,\"y\":%.3f,\"z\":%.3f,\"dx\":%.4f,\"dy\":%.4f}",
                        ++sequence, System.currentTimeMillis(), px, py, pz, dx, dy);
                    Path temporary = output.resolve("position.tmp");
                    Files.writeString(temporary, json, StandardCharsets.UTF_8);
                    Files.move(temporary, output.resolve("position.json"),
                        StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                }
                Thread.sleep(200);
            }
            Files.writeString(output.resolve("status.txt"), "stopped", StandardCharsets.UTF_8);
        } catch (Exception error) {
            error.printStackTrace();
            try {
                Files.writeString(output.resolve("error.txt"), error.toString(), StandardCharsets.UTF_8);
                Files.writeString(output.resolve("status.txt"), "failed", StandardCharsets.UTF_8);
            } catch (Exception reportingError) {
                reportingError.printStackTrace();
            }
        }
    }

    private static boolean leaseAlive(Path output) throws Exception {
        Path lease = output.resolve("lease");
        return Files.exists(lease) && System.currentTimeMillis() - Files.getLastModifiedTime(lease).toMillis() < 20_000;
    }
}
