export async function register() {
  (globalThis as any).__INSTRUMENTATION_REGISTERED__ = true;
}
