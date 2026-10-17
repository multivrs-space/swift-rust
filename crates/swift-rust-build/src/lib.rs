//! Build pipeline for swift-rust.
//!
//! Responsible for taking a user's project directory and producing the
//! artefacts needed to run in production:
//!
//! 1. A bundled JS/TSX payload (the React tree + all imports).
//! 2. A static asset manifest (images, fonts, PDFs).
//! 3. A route table (pages, layouts, API routes, special files).
//! 4. A build manifest (input hashes → output paths).
//!
//! The actual bundling is delegated to the `bundler` crate; this crate
//! orchestrates the build, validates the project structure, and emits the
//! final manifest.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, BuildError>;

#[derive(Debug, Error)]
pub enum BuildError {
    #[error("source directory not found: {0}")]
    SourceNotFound(PathBuf),

    #[error("invalid project structure: {0}")]
    InvalidStructure(String),

    #[error("bundler: {0}")]
    Bundler(String),

    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization: {0}")]
    Serde(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildInput {
    pub project_root: PathBuf,
    pub mode: swift_rust_core::RenderMode,
    pub target: BuildTarget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum BuildTarget {
    #[default]
    Development,
    Production,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildOutput {
    pub bundle: PathBuf,
    pub manifest: BuildManifest,
    pub routes: RouteTable,
    pub assets: Vec<AssetEntry>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BuildManifest {
    pub version: String,
    pub build_id: String,
    pub build_target: BuildTarget,
    pub created_at: String,
    pub input_hashes: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RouteTable {
    pub pages: Vec<RouteEntry>,
    pub api: Vec<ApiRouteEntry>,
    pub layouts: Vec<RouteEntry>,
    pub special: BTreeMap<String, Vec<SpecialFileEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteEntry {
    pub pattern: String,
    pub file: PathBuf,
    pub dynamic_segments: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRouteEntry {
    pub pattern: String,
    pub file: PathBuf,
    pub methods: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecialFileEntry {
    pub kind: SpecialFileKind,
    pub file: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SpecialFileKind {
    Loading,
    Error,
    NotFound,
    GlobalError,
    Template,
    Default,
    Robots,
    Sitemap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetEntry {
    pub source: PathBuf,
    pub destination: PathBuf,
    pub content_type: String,
    pub size: u64,
    pub kind: swift_rust_core::AssetKind,
}

pub struct BuildPipeline {
    #[allow(dead_code)]
    config: BuildConfig,
}

#[derive(Debug, Clone, Default)]
pub struct BuildConfig {
    pub minify: bool,
    pub sourcemap: bool,
    pub target: BuildTarget,
}

impl BuildPipeline {
    pub fn new(config: BuildConfig) -> Self {
        Self { config }
    }

    pub fn build(&self, input: BuildInput) -> Result<BuildOutput> {
        if !input.project_root.exists() {
            return Err(BuildError::SourceNotFound(input.project_root));
        }
        let start = std::time::Instant::now();
        tracing::info!(mode = %input.mode, "starting build");

        let routes = self.scan_routes(&input.project_root)?;
        let assets = self.scan_assets(&input.project_root)?;
        let manifest = BuildManifest {
            version: env!("CARGO_PKG_VERSION").to_string(),
            build_id: blake3::hash(b"swift-rust-build").to_hex().to_string(),
            build_target: input.target,
            created_at: chrono::Utc::now().to_rfc3339(),
            input_hashes: BTreeMap::new(),
        };

        let bundle = input.project_root.join(".swift-rust").join("dist");
        std::fs::create_dir_all(&bundle)?;

        let output = BuildOutput {
            bundle,
            manifest,
            routes,
            assets,
            duration_ms: start.elapsed().as_millis() as u64,
        };
        Ok(output)
    }

    fn scan_routes(&self, root: &std::path::Path) -> Result<RouteTable> {
        let mut table = RouteTable::default();
        let app_dir = if root.join("src").join("app").exists() {
            root.join("src").join("app")
        } else if root.join("app").exists() {
            root.join("app")
        } else {
            return Ok(table);
        };
        walk_routes(&app_dir, &app_dir, "", &mut table)
            .map_err(|e| BuildError::InvalidStructure(e.to_string()))?;
        Ok(table)
    }

    fn scan_assets(&self, root: &std::path::Path) -> Result<Vec<AssetEntry>> {
        let public_dir = root.join("public");
        let mut assets = Vec::new();
        if !public_dir.exists() {
            return Ok(assets);
        }
        for entry in walkdir::WalkDir::new(&public_dir)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if entry.file_type().is_file() {
                let path = entry.path().to_path_buf();
                let rel = path
                    .strip_prefix(&public_dir)
                    .unwrap_or(&path)
                    .to_path_buf();
                let mime = mime_guess::from_path(&path).first_or_octet_stream();
                let metadata = std::fs::metadata(&path).ok();
                let size = metadata.as_ref().map(|m| m.len()).unwrap_or(0);
                let kind = if mime.type_() == "image" {
                    swift_rust_core::AssetKind::Image
                } else if mime.type_() == "font" {
                    swift_rust_core::AssetKind::Font
                } else if mime == "application/pdf" {
                    swift_rust_core::AssetKind::Pdf
                } else {
                    swift_rust_core::AssetKind::Other
                };
                assets.push(AssetEntry {
                    source: path,
                    destination: PathBuf::from("/").join(rel),
                    content_type: mime.to_string(),
                    size,
                    kind,
                });
            }
        }
        Ok(assets)
    }
}

fn walk_routes(
    base: &std::path::Path,
    dir: &std::path::Path,
    prefix: &str,
    table: &mut RouteTable,
) -> std::io::Result<()> {
    walk_routes_inner(base, dir, prefix, table)
}

fn walk_routes_inner(
    base: &std::path::Path,
    dir: &std::path::Path,
    prefix: &str,
    table: &mut RouteTable,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if file_name.starts_with('_') {
                continue;
            }
            if file_name.starts_with('@') {
                continue;
            }

            let segment_name = if let Some(stripped) = file_name.strip_prefix("%5F") {
                format!("_{stripped}")
            } else {
                file_name.clone()
            };

            let is_route_group = segment_name.starts_with('(') && segment_name.ends_with(')');
            let next = if is_route_group {
                prefix.to_string()
            } else if prefix.is_empty() {
                segment_name
            } else {
                format!("{prefix}/{segment_name}")
            };
            walk_routes_inner(base, &entry.path(), &next, table)?;
            continue;
        }
        let ext = std::path::Path::new(&file_name)
            .extension()
            .and_then(|e| e.to_str());
        if !matches!(ext, Some("tsx") | Some("ts") | Some("jsx") | Some("js")) {
            continue;
        }
        let stem = std::path::Path::new(&file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        let rel = entry
            .path()
            .strip_prefix(base)
            .unwrap_or(&entry.path())
            .to_path_buf();
        let dynamic_segments: Vec<String> = prefix
            .split('/')
            .filter(|s| s.starts_with('[') && s.ends_with(']'))
            .map(|s| s.trim_start_matches('[').trim_end_matches(']').to_string())
            .collect();

        match stem {
            "page" => {
                let pattern = if prefix.is_empty() {
                    "/".to_string()
                } else {
                    format!("/{prefix}")
                };
                table.pages.push(RouteEntry {
                    pattern,
                    file: rel,
                    dynamic_segments,
                });
            }
            "layout" => {
                let pattern = if prefix.is_empty() {
                    "/".to_string()
                } else {
                    format!("/{prefix}")
                };
                table.layouts.push(RouteEntry {
                    pattern,
                    file: rel,
                    dynamic_segments,
                });
            }
            "template" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::Template,
                        file: rel,
                    });
            }
            "default" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::Default,
                        file: rel,
                    });
            }
            "route" => {
                let pattern = if prefix.is_empty() {
                    "/".to_string()
                } else {
                    format!("/{prefix}")
                };
                let methods =
                    extract_route_methods(&entry.path()).unwrap_or_else(|| vec!["GET".to_string()]);
                table.api.push(ApiRouteEntry {
                    pattern,
                    file: rel,
                    methods,
                });
            }
            "loading" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::Loading,
                        file: rel,
                    });
            }
            "not-found" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::NotFound,
                        file: rel,
                    });
            }
            "error" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::Error,
                        file: rel,
                    });
            }
            "global-error" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::GlobalError,
                        file: rel,
                    });
            }
            "robots" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::Robots,
                        file: rel,
                    });
            }
            "sitemap" => {
                table
                    .special
                    .entry(prefix.to_string())
                    .or_default()
                    .push(SpecialFileEntry {
                        kind: SpecialFileKind::Sitemap,
                        file: rel,
                    });
            }
            _ => {}
        }
    }
    Ok(())
}

fn extract_route_methods(_path: &std::path::Path) -> Option<Vec<String>> {
    None
}

pub fn build_vercel_route_regex(pattern: &str) -> (String, String) {
    let mut dest_query = Vec::new();
    let mut param_idx = 1;
    let mut regex_parts: Vec<String> = Vec::new();

    for seg in pattern.split('/').filter(|s| !s.is_empty()) {
        if seg.starts_with("[[...") && seg.ends_with("]]") {
            regex_parts.push("(?:/(.*))?".to_string());
            dest_query.push(format!("__sr_p{}=${param_idx}", param_idx - 1));
            param_idx += 1;
        } else if seg.starts_with("[...") && seg.ends_with(']') {
            regex_parts.push("/(.+)".to_string());
            dest_query.push(format!("__sr_p{}=${param_idx}", param_idx - 1));
            param_idx += 1;
        } else if seg.starts_with('[') && seg.ends_with(']') {
            regex_parts.push("/([^/]+)".to_string());
            dest_query.push(format!("__sr_p{}=${param_idx}", param_idx - 1));
            param_idx += 1;
        } else {
            regex_parts.push(format!("/{seg}"));
        }
    }

    let joined_regex = regex_parts.join("");
    let regex = format!("^{joined_regex}/?$");
    let dest = if dest_query.is_empty() {
        pattern.to_string()
    } else {
        format!("{pattern}?{}", dest_query.join("&"))
    };
    (regex, dest)
}

pub fn emit_vercel_config(output: &BuildOutput, out_dir: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(out_dir)?;
    let mut routes = Vec::new();
    routes.push(serde_json::json!({
        "src": "/_swift-rust/static/(.*)",
        "headers": { "Cache-Control": "public, max-age=31536000, immutable" }
    }));
    routes.push(serde_json::json!({
        "src": "/fonts/(.*)",
        "headers": { "Cache-Control": "public, max-age=31536000, immutable" }
    }));
    for page in &output.routes.pages {
        if !page.dynamic_segments.is_empty() {
            let (regex, dest) = build_vercel_route_regex(&page.pattern);
            routes.push(serde_json::json!({
                "src": regex,
                "dest": dest
            }));
        }
    }
    routes.push(serde_json::json!({ "handle": "filesystem" }));
    routes.push(serde_json::json!({
        "src": "^(.*)$",
        "status": 404,
        "dest": "/404.html"
    }));

    let config = serde_json::json!({
        "version": 3,
        "routes": routes,
        "overrides": {
            "404.html": { "path": "404", "contentType": "text/html; charset=utf-8" }
        },
        "images": {
            "sizes": [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
            "formats": ["image/avif", "image/webp"],
            "minimumCacheTTL": 86400,
            "dangerouslyAllowSVG": true,
            "contentSecurityPolicy": "default-src 'self'; script-src 'none'; sandbox;"
        }
    });

    let formatted = serde_json::to_string_pretty(&config)?;
    std::fs::write(out_dir.join("config.json"), formatted)?;
    Ok(())
}

pub fn write_manifest(output: &BuildOutput, dir: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(&output.manifest)?;
    std::fs::write(dir.join("manifest.json"), json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_minimal_project() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::create_dir_all(dir.path().join("app")).expect("create app");
        let pipeline = BuildPipeline::new(BuildConfig::default());
        let out = pipeline
            .build(BuildInput {
                project_root: dir.path().to_path_buf(),
                mode: swift_rust_core::RenderMode::Ssr,
                target: BuildTarget::Development,
            })
            .unwrap();
        assert!(!out.manifest.build_id.is_empty());
    }

    #[test]
    fn scans_all_route_conventions() {
        let dir = tempfile::tempdir().expect("tempdir");
        let app = dir.path().join("src").join("app");
        std::fs::create_dir_all(&app).expect("create src/app");
        std::fs::write(app.join("page.tsx"), "export default function Home() {}").unwrap();
        std::fs::write(app.join("template.tsx"), "export default function T() {}").unwrap();
        std::fs::write(app.join("robots.ts"), "export default function R() {}").unwrap();

        let item = app.join("item").join("[id]");
        std::fs::create_dir_all(&item).unwrap();
        std::fs::write(item.join("page.tsx"), "export default function Item() {}").unwrap();

        let docs = app.join("docs").join("[[...slug]]");
        std::fs::create_dir_all(&docs).unwrap();
        std::fs::write(docs.join("page.tsx"), "export default function Docs() {}").unwrap();

        let secret = app.join("_secret");
        std::fs::create_dir_all(&secret).unwrap();
        std::fs::write(secret.join("page.tsx"), "export default function S() {}").unwrap();

        let slot = app.join("@slot");
        std::fs::create_dir_all(&slot).unwrap();
        std::fs::write(slot.join("page.tsx"), "export default function Slot() {}").unwrap();

        let pipeline = BuildPipeline::new(BuildConfig::default());
        let out = pipeline
            .build(BuildInput {
                project_root: dir.path().to_path_buf(),
                mode: swift_rust_core::RenderMode::Ssr,
                target: BuildTarget::Production,
            })
            .unwrap();

        let patterns: Vec<String> = out.routes.pages.iter().map(|p| p.pattern.clone()).collect();
        assert!(patterns.contains(&"/".to_string()));
        assert!(patterns.contains(&"/item/[id]".to_string()));
        assert!(patterns.contains(&"/docs/[[...slug]]".to_string()));
        assert!(!patterns.iter().any(|p| p.contains("_secret")));
        assert!(!patterns.iter().any(|p| p.contains("@slot")));

        let vercel_dir = dir.path().join(".vercel").join("output");
        emit_vercel_config(&out, &vercel_dir).unwrap();
        let config_str = std::fs::read_to_string(vercel_dir.join("config.json")).unwrap();
        assert!(config_str.contains("\"version\": 3"));
        assert!(config_str.contains("^/item/([^/]+)/?$"));
        assert!(config_str.contains("^/docs(?:/(.*))?/?$"));
    }

    #[test]
    fn vercel_route_regex_builder() {
        let (regex, dest) = build_vercel_route_regex("/item/[id]");
        assert_eq!(regex, "^/item/([^/]+)/?$");
        assert_eq!(dest, "/item/[id]?__sr_p0=$1");

        let (regex_ca, dest_ca) = build_vercel_route_regex("/docs/[[...slug]]");
        assert_eq!(regex_ca, "^/docs(?:/(.*))?/?$");
        assert_eq!(dest_ca, "/docs/[[...slug]]?__sr_p0=$1");
    }
}
