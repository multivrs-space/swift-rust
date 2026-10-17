export default function DocsPage({ params }: { params: { slug?: string[] } }) {
  return (
    <div data-docs>
      docs-slug:{params?.slug ? params.slug.join("/") : "ROOT_DOCS"}
    </div>
  );
}
