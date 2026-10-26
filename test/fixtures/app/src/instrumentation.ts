export async function register() {
  (globalThis as any).__INSTRUMENTATION_REGISTERED__ = true;
}

export async function onRequestError(
  err: unknown,
  _request: Request,
  context: { routePath: string },
) {
  (globalThis as any).__LAST_REQUEST_ERROR__ = `${context.routePath}: ${(err as Error)?.message}`;
}
