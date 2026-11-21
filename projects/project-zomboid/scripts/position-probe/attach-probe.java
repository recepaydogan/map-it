import com.sun.tools.attach.VirtualMachine;
import java.nio.file.Path;

public final class AttachProbe {
    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Expected PID, agent JAR, output directory");
        VirtualMachine vm = VirtualMachine.attach(args[0]);
        try {
            vm.loadAgent(Path.of(args[1]).toAbsolutePath().toString(),
                Path.of(args[2]).toAbsolutePath().toString());
        } finally {
            vm.detach();
        }
    }
}
