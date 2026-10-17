export default function InterceptedPhotoModal({
  params,
}: {
  params: { id: string };
}) {
  return <div data-photo-modal>photo-modal:{params?.id}</div>;
}
