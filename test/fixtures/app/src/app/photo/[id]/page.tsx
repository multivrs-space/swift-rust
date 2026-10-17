export default function PhotoPage({ params }: { params: { id: string } }) {
  return <div data-photo-page>full-photo-page:{params?.id}</div>;
}
