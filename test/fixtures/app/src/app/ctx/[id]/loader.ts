export default function loader({ params }: { params: { id: string } }) {
  return { id: params.id };
}
