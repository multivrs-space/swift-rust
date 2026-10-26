export function GET() {
  return Response.json({
    registered: Boolean((globalThis as any).__INSTRUMENTATION_REGISTERED__),
    lastError: (globalThis as any).__LAST_REQUEST_ERROR__ ?? null,
  });
}
