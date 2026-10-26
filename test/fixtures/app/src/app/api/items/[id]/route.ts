export function GET({ params, query }: { params: { id: string }; query: Record<string, string> }) {
  return { id: params.id, q: query.q ?? null };
}

export function DELETE() {
  return new Response(null, { status: 204 });
}
