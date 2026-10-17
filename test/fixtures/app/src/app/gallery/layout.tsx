import type { ReactNode } from "react";

export default function GalleryLayout({
  children,
  modal,
}: {
  children: ReactNode;
  modal?: ReactNode;
}) {
  return (
    <div>
      <div data-gallery-main>{children}</div>
      <div data-gallery-modal>{modal}</div>
    </div>
  );
}
