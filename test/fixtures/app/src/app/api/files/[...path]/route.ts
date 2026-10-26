export function GET({ params }: { params: { path: string[] } }) {
  return { path: params.path };
}
