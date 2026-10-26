import { Suspense, use } from "react";
import { useLoaderData } from "swift-rust/router";

function Late({ wait }: { wait: Promise<void> }) {
  use(wait);
  const data = useLoaderData<{ id: string }>();
  return <p data-late-id={data?.id ?? "missing"}>late</p>;
}

export default function CtxPage({ params }: { params: { id: string } }) {
  const ms = params.id.startsWith("slow") ? 150 : 5;
  const wait = new Promise<void>((resolve) => setTimeout(resolve, ms));
  return (
    <Suspense fallback={<p>loading</p>}>
      <Late wait={wait} />
    </Suspense>
  );
}
