// instrumentation.ts — runs once when the server starts. On the demo site (lib/demo.ts) it
// freezes the clock at the demo moment; everywhere else it does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { installDemoClock } = await import("./lib/demo");
  installDemoClock();
}
