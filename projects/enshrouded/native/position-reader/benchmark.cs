using System;
using System.Diagnostics;
using System.Globalization;
using System.Threading;
using EnshroudedCompanion;

internal static class Benchmark
{
    private static void Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--layout")
        {
            var clock = Stopwatch.StartNew();
            RootLayout layout = RootLayout.Resolve(args[1], null, delegate { return false; });
            if (layout == null) throw new Exception("No unique validated root signature found.");
            Console.WriteLine("layout root=" + layout.RootRva.ToString("x") + " size=" + layout.RootSize.ToString("x")
                + " signature=" + layout.SignatureRva.ToString("x") + " elapsedMs=" + clock.ElapsedMilliseconds);
            return;
        }
        int pid = Int32.Parse(args[0], CultureInfo.InvariantCulture);
        if (args.Length > 1 && args[1] == "--cold-arena")
        {
            using (var game = Process.GetProcessById(pid))
            using (var memory = new MemoryReader(pid))
            {
                RootLayout layout = RootLayout.Resolve(game.MainModule.FileName, null, delegate { return false; });
                var locator = new ArenaLocator(memory, game.MainModule.BaseAddress.ToInt64(), layout, null);
                var clock = Stopwatch.StartNew();
                while (clock.ElapsedMilliseconds < 120000 && !locator.Step(clock.ElapsedMilliseconds, -1)) Thread.Sleep(50);
                Console.WriteLine("cold arena=" + locator.Address.ToString("x") + " field=" + locator.Field + " offset=" + locator.PlayerOffset
                    + " reason=" + locator.Reason + " candidates=" + locator.CandidateCount + " scanBytes=" + locator.ScanBytes + " elapsedMs=" + clock.ElapsedMilliseconds);
                if (locator.Address == 0) Environment.ExitCode = 1;
            }
            return;
        }
        int seconds = args.Length > 1 ? Int32.Parse(args[1], CultureInfo.InvariantCulture) : 30;
        using (var reader = new PositionReader())
        using (var self = Process.GetCurrentProcess())
        {
            var clock = Stopwatch.StartNew();
            var cpu = self.TotalProcessorTime;
            reader.start(pid, delegate(object result) {});
            string latest = "";
            double acquired = -1;
            long hotCpu = 0, hotBytes = 0;
            while (clock.Elapsed.TotalSeconds < seconds)
            {
                reader.getSnapshot(delegate(object value) { latest = (string)value; });
                if (acquired < 0 && latest.Contains("\"state\":\"live\""))
                {
                    acquired = clock.Elapsed.TotalSeconds;
                    self.Refresh();
                    hotCpu = self.TotalProcessorTime.Ticks;
                    hotBytes = self.PrivateMemorySize64;
                    Console.WriteLine("acquired " + latest);
                }
                Thread.Sleep(50);
            }
            self.Refresh();
            double elapsed = clock.Elapsed.TotalSeconds;
            double totalCpu = (self.TotalProcessorTime-cpu).TotalSeconds;
            double hotSeconds = acquired >= 0 ? elapsed-acquired : 0;
            double hotCpuSeconds = acquired >= 0 ? (self.TotalProcessorTime.Ticks-hotCpu)/10000000.0 : 0;
            Console.WriteLine("final " + latest);
            Console.WriteLine("{" + String.Format(CultureInfo.InvariantCulture,
                "\"elapsedSeconds\":{0:F3},\"acquiredSeconds\":{1:F3},\"cpuSeconds\":{2:F4},\"cpuPercentOneCore\":{3:F3},\"hotCpuPercentOneCore\":{4:F3},\"privateMiB\":{5:F2},\"workingSetMiB\":{6:F2},\"hotPrivateGrowthKiB\":{7:F1}",
                elapsed,acquired,totalCpu,totalCpu/elapsed*100,hotSeconds>0?hotCpuSeconds/hotSeconds*100:0,
                self.PrivateMemorySize64/1048576.0,self.WorkingSet64/1048576.0,(self.PrivateMemorySize64-hotBytes)/1024.0) + "}");
            reader.stop(delegate(object result) {});
        }
    }
}
