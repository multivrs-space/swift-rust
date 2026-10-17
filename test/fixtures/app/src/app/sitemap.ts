export default function sitemap() {
  return [
    {
      url: "https://example.com",
      lastModified: "2026-10-16",
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: "https://example.com/about",
      lastModified: "2026-10-15",
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
