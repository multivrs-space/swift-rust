export function GET() {
  return Response.json({ registered: Boolean((globalThis as any).__INSTRUMENTATION_REGISTERED__) });
}
