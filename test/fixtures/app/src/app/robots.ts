export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/secret/",
    },
    sitemap: "https://example.com/sitemap.xml",
    host: "https://example.com",
  };
}
