use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Error {
    #[error("[SR0001] configuration error: {message}")]
    Config { message: String },

    #[error("[SR0002] routing error: {message}")]
    Routing { message: String },

    #[error("[SR0003] compilation error in {file}: {message}")]
    Compilation { file: String, message: String },

    #[error("[SR0004] bundling error: {message}")]
    Bundling { message: String },

    #[error("[SR0005] server error: {message}")]
    Server { message: String },

    #[error("[SR0006] image error: {message}")]
    Image { message: String },

    #[error("[SR0007] font error: {message}")]
    Font { message: String },

    #[error("[SR0008] pdf error: {message}")]
    Pdf { message: String },

    #[error("[SR0009] IO error: {0}")]
    Io(String),

    #[error("[SR0010] unknown error: {0}")]
    Unknown(String),
}

impl Error {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Config { .. } => "SR0001",
            Self::Routing { .. } => "SR0002",
            Self::Compilation { .. } => "SR0003",
            Self::Bundling { .. } => "SR0004",
            Self::Server { .. } => "SR0005",
            Self::Image { .. } => "SR0006",
            Self::Font { .. } => "SR0007",
            Self::Pdf { .. } => "SR0008",
            Self::Io(_) => "SR0009",
            Self::Unknown(_) => "SR0010",
        }
    }

    pub fn solution(&self) -> &'static str {
        match self {
            Self::Config { .. } => {
                "Check swift-rust.config.json for valid JSON syntax and supported keys (rendering, image, font, pdf)."
            }
            Self::Routing { .. } => {
                "Verify that your route files (page.tsx, layout.tsx, route.ts) live inside src/app/ or app/ and export a default handler."
            }
            Self::Compilation { .. } => {
                "Check the highlighted file for syntax errors, missing imports, or mismatched named/default exports."
            }
            Self::Bundling { .. } => {
                "Ensure all imports in 'use client' files are browser-compatible and run `bun run build` if workspace packages were cleaned."
            }
            Self::Server { .. } => {
                "Verify the requested port is free (or pass `--port <number>`) and check your server handler for unhandled exceptions."
            }
            Self::Image { .. } => {
                "Verify the image file exists in `public/` and uses a supported format (PNG, JPEG, WebP, AVIF, SVG)."
            }
            Self::Font { .. } => {
                "Check the font family name in `swift-rust/font/google` or verify the local font file path exists."
            }
            Self::Pdf { .. } => {
                "Verify the PDF <Document> and <Page> tree uses valid dimensions and serializable props."
            }
            Self::Io(_) => {
                "Verify the file or directory exists and that the current user has read/write permissions."
            }
            Self::Unknown(_) => {
                "Check the error details above and run `bun run typecheck` to inspect full diagnostics."
            }
        }
    }

    pub fn format_diagnostic(&self) -> String {
        format!("✗ {}\n│\n│ 💡 Solution: {}", self, self.solution())
    }
}

impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Self::Unknown(format!("json: {e}"))
    }
}

impl From<toml::de::Error> for Error {
    fn from(e: toml::de::Error) -> Self {
        Self::Config {
            message: e.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_diagnostic_with_clear_solution() {
        let err = Error::Bundling {
            message: "Could not resolve './missing'".to_string(),
        };
        let out = err.format_diagnostic();
        assert!(out.contains("[SR0004]"));
        assert!(out.contains("💡 Solution:"));
        assert!(out.contains("browser-compatible"));
    }
}
