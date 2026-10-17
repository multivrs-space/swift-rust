import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div data-templated="true">{children}</div>;
}
