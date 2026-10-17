//! Core types, traits, and utilities for swift-rust.
//!
//! This crate is the foundation of the swift-rust workspace. It defines the
//! shared vocabulary that every other crate speaks: routes, request/response
//! shapes, asset references, error categories, and the small set of helpers
//! we copy-pasted into five places before giving up and making a crate.
//!
//! It deliberately depends on very few things. If you're considering adding
//! `axum`, `tokio`, or `serde_yaml` here, put it in a more specific crate
//! instead.

pub mod component;

use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, CoreError>;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("invalid route: {0}")]
    InvalidRoute(String),

    #[error("missing field: {0}")]
    MissingField(&'static str),

    #[error("asset not found: {0}")]
    AssetNotFound(String),

    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization: {0}")]
    Serde(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RenderMode {
    Ssr,
    SsrWasm,
    SsrHtmx,
    Wasm,
}

impl fmt::Display for RenderMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Ssr => write!(f, "ssr"),
            Self::SsrWasm => write!(f, "ssr-wasm"),
            Self::SsrHtmx => write!(f, "ssr-htmx"),
            Self::Wasm => write!(f, "wasm"),
        }
    }
}

impl std::str::FromStr for RenderMode {
    type Err = String;
    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "ssr" => Ok(Self::Ssr),
            "ssr-wasm" => Ok(Self::SsrWasm),
            "ssr-htmx" => Ok(Self::SsrHtmx),
            "wasm" => Ok(Self::Wasm),
            other => Err(format!("unknown render mode: {other}")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RouteSegment {
    pub name: String,
    pub is_dynamic: bool,
    pub is_catchall: bool,
}

impl RouteSegment {
    pub fn static_part(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            is_dynamic: false,
            is_catchall: false,
        }
    }

    pub fn dynamic(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            is_dynamic: true,
            is_catchall: false,
        }
    }

    pub fn catchall(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            is_dynamic: true,
            is_catchall: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub struct RouteParams(pub Vec<(String, String)>);

impl RouteParams {
    pub fn new() -> Self {
        Self(Vec::new())
    }

    pub fn insert(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.0.push((key.into(), value.into()));
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.0
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Head,
    Options,
}

impl HttpMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Get => "GET",
            Self::Post => "POST",
            Self::Put => "PUT",
            Self::Delete => "DELETE",
            Self::Patch => "PATCH",
            Self::Head => "HEAD",
            Self::Options => "OPTIONS",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_uppercase().as_str() {
            "GET" => Some(Self::Get),
            "POST" => Some(Self::Post),
            "PUT" => Some(Self::Put),
            "DELETE" => Some(Self::Delete),
            "PATCH" => Some(Self::Patch),
            "HEAD" => Some(Self::Head),
            "OPTIONS" => Some(Self::Options),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct AssetRef {
    pub path: String,
    pub content_type: String,
    pub size: u64,
}

impl AssetRef {
    pub fn new(path: impl Into<String>, content_type: impl Into<String>, size: u64) -> Self {
        Self {
            path: path.into(),
            content_type: content_type.into(),
            size,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AssetKind {
    Image,
    Font,
    Pdf,
    Video,
    Audio,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub name: String,
    pub version: String,
    pub render_mode: RenderMode,
    pub page_count: usize,
    pub api_count: usize,
    pub components: Vec<String>,
}

pub fn workspace_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn route_params_lookup() {
        let mut p = RouteParams::new();
        p.insert("slug", "hello-world");
        assert_eq!(p.get("slug"), Some("hello-world"));
        assert_eq!(p.get("missing"), None);
    }

    #[test]
    fn http_method_roundtrip() {
        for m in [
            HttpMethod::Get,
            HttpMethod::Post,
            HttpMethod::Put,
            HttpMethod::Delete,
        ] {
            assert_eq!(HttpMethod::parse(m.as_str()), Some(m));
        }
    }

    #[test]
    fn render_mode_display() {
        assert_eq!(RenderMode::Ssr.to_string(), "ssr");
        assert_eq!(RenderMode::SsrWasm.to_string(), "ssr-wasm");
    }
}
