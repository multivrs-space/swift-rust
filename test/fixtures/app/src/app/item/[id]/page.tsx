'use node';
import { Counter } from "@/components/counter";
export default function Item({ params }: any) {
  return (
    <main data-item data-api={process.env.SWIFT_RUST_PUBLIC_API_URL ?? ""}>
      id={params?.id ?? "?"}
      <Counter start={2} label="qty" />
    </main>
  );
}
