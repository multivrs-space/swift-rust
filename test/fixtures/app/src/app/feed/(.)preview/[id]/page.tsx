export default function InterceptedPreviewPage({ params }: { params: { id: string } }) {
  return <div>intercepted-preview:{params?.id}</div>;
}
