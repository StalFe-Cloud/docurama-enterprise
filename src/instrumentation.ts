/** Keep Node-only worker imports out of Next's Edge instrumentation bundle. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNodeWorkers } = await import("./instrumentation-node");
    await registerNodeWorkers();
  }
}
