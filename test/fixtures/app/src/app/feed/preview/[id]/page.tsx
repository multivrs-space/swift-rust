export default function DirectPreviewPage({ params }: { params: { id: string } }) {
  return <div>direct-preview:{params?.id}</div>;
}
