export function GET({ query }: { query: Record<string, string> }) {
  return { items: ["a", "b"], limit: query.limit ?? null };
}

export function POST({ body }: { body: { name?: string } }) {
  return { created: body?.name ?? null, status: 201 };
}
