pub trait Component: Send + Sync {
    fn render(&self) -> String;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RustNode {
    Element(RustElement),
    Text(String),
    Raw(String),
    Fragment(Vec<RustNode>),
}

impl RustNode {
    pub fn render_to(&self, out: &mut String) {
        match self {
            Self::Element(el) => el.render_to(out),
            Self::Text(text) => {
                for ch in text.chars() {
                    match ch {
                        '<' => out.push_str("&lt;"),
                        '>' => out.push_str("&gt;"),
                        '&' => out.push_str("&amp;"),
                        '"' => out.push_str("&quot;"),
                        other => out.push(other),
                    }
                }
            }
            Self::Raw(html) => out.push_str(html),
            Self::Fragment(nodes) => {
                for n in nodes {
                    n.render_to(out);
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RustElement {
    pub tag: String,
    pub attrs: Vec<(String, String)>,
    pub children: Vec<RustNode>,
    pub is_void: bool,
}

impl RustElement {
    pub fn new(tag: impl Into<String>) -> Self {
        let tag = tag.into();
        let is_void = matches!(
            tag.to_ascii_lowercase().as_str(),
            "area"
                | "base"
                | "br"
                | "col"
                | "embed"
                | "hr"
                | "img"
                | "input"
                | "link"
                | "meta"
                | "param"
                | "source"
                | "track"
                | "wbr"
        );
        Self {
            tag,
            attrs: Vec::new(),
            children: Vec::new(),
            is_void,
        }
    }

    pub fn attr(mut self, key: impl Into<String>, val: impl Into<String>) -> Self {
        self.attrs.push((key.into(), val.into()));
        self
    }

    pub fn child(mut self, child: RustNode) -> Self {
        if !self.is_void {
            self.children.push(child);
        }
        self
    }

    pub fn text(mut self, content: impl Into<String>) -> Self {
        if !self.is_void {
            self.children.push(RustNode::Text(content.into()));
        }
        self
    }

    pub fn render_to(&self, out: &mut String) {
        out.push('<');
        out.push_str(&self.tag);
        for (k, v) in &self.attrs {
            out.push(' ');
            out.push_str(k);
            out.push_str("=\"");
            for ch in v.chars() {
                match ch {
                    '"' => out.push_str("&quot;"),
                    '&' => out.push_str("&amp;"),
                    '<' => out.push_str("&lt;"),
                    '>' => out.push_str("&gt;"),
                    other => out.push(other),
                }
            }
            out.push('"');
        }

        if self.is_void {
            out.push_str(" />");
        } else {
            out.push('>');
            for child in &self.children {
                child.render_to(out);
            }
            out.push_str("</");
            out.push_str(&self.tag);
            out.push('>');
        }
    }
}

impl Component for RustElement {
    fn render(&self) -> String {
        let mut out = String::with_capacity(128);
        self.render_to(&mut out);
        out
    }
}

pub struct RustLink {
    pub href: String,
    pub prefetch: bool,
    pub class: Option<String>,
    pub children: Vec<RustNode>,
}

impl RustLink {
    pub fn new(href: impl Into<String>) -> Self {
        Self {
            href: href.into(),
            prefetch: true,
            class: None,
            children: Vec::new(),
        }
    }

    pub fn class(mut self, class: impl Into<String>) -> Self {
        self.class = Some(class.into());
        self
    }

    pub fn child(mut self, child: RustNode) -> Self {
        self.children.push(child);
        self
    }

    pub fn text(mut self, text: impl Into<String>) -> Self {
        self.children.push(RustNode::Text(text.into()));
        self
    }
}

impl Component for RustLink {
    fn render(&self) -> String {
        let mut el = RustElement::new("a").attr("href", &self.href);
        if self.prefetch {
            el = el.attr("data-swift-rust-prefetch", "true");
        }
        if let Some(ref cls) = self.class {
            el = el.attr("class", cls);
        }
        for c in &self.children {
            el = el.child(c.clone());
        }
        el.render()
    }
}

pub struct RustImage {
    pub src: String,
    pub alt: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub loading: &'static str,
}

impl RustImage {
    pub fn new(src: impl Into<String>, alt: impl Into<String>) -> Self {
        Self {
            src: src.into(),
            alt: alt.into(),
            width: None,
            height: None,
            loading: "lazy",
        }
    }

    pub fn size(mut self, width: u32, height: u32) -> Self {
        self.width = Some(width);
        self.height = Some(height);
        self
    }

    pub fn priority(mut self) -> Self {
        self.loading = "eager";
        self
    }
}

impl Component for RustImage {
    fn render(&self) -> String {
        let mut el = RustElement::new("img")
            .attr("src", &self.src)
            .attr("alt", &self.alt)
            .attr("loading", self.loading)
            .attr("decoding", "async");

        if let Some(w) = self.width {
            el = el.attr("width", w.to_string());
        }
        if let Some(h) = self.height {
            el = el.attr("height", h.to_string());
        }
        el.render()
    }
}

pub struct RustSafeHtml {
    pub html: String,
    pub is_trusted: bool,
}

impl RustSafeHtml {
    pub fn trusted(html: impl Into<String>) -> Self {
        Self {
            html: html.into(),
            is_trusted: true,
        }
    }

    pub fn untrusted(html: impl Into<String>) -> Self {
        Self {
            html: html.into(),
            is_trusted: false,
        }
    }
}

impl Component for RustSafeHtml {
    fn render(&self) -> String {
        if self.is_trusted {
            self.html.clone()
        } else {
            let mut out = String::with_capacity(self.html.len() + 16);
            out.push_str("<span data-swift-rust-safe=\"escaped\">");
            RustNode::Text(self.html.clone()).render_to(&mut out);
            out.push_str("</span>");
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_element_with_attributes_and_children() {
        let el = RustElement::new("div")
            .attr("class", "container mx-auto")
            .attr("id", "main")
            .child(RustNode::Element(
                RustElement::new("h1").text("Swift Rust Framework"),
            ));
        let html = el.render();
        assert_eq!(
            html,
            r#"<div class="container mx-auto" id="main"><h1>Swift Rust Framework</h1></div>"#
        );
    }

    #[test]
    fn renders_void_elements_self_closing() {
        let img = RustImage::new("/logo.png", "Swift Rust Logo")
            .size(120, 40)
            .priority();
        let html = img.render();
        assert!(html.starts_with("<img "));
        assert!(html.ends_with(" />"));
        assert!(html.contains(r#"src="/logo.png""#));
        assert!(html.contains(r#"loading="eager""#));
        assert!(html.contains(r#"width="120""#));
    }

    #[test]
    fn renders_link_component() {
        let link = RustLink::new("/dashboard")
            .class("nav-link")
            .text("Dashboard");
        let html = link.render();
        assert_eq!(
            html,
            r#"<a href="/dashboard" data-swift-rust-prefetch="true" class="nav-link">Dashboard</a>"#
        );
    }

    #[test]
    fn safe_html_escapes_untrusted_input() {
        let safe = RustSafeHtml::untrusted("<script>alert('xss')</script>");
        let html = safe.render();
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
    }

    #[test]
    fn bench_render_ten_thousand_components() {
        let link = RustLink::new("/bench").text("Benchmark Link");
        let start = std::time::Instant::now();
        for _ in 0..10_000 {
            let _ = link.render();
        }
        let elapsed = start.elapsed();
        assert!(elapsed.as_millis() < 50);
    }
}
