use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TrustedHtml {
    pub html: String,
    pub signature: String,
    pub origin: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HtmlSecurityStatus {
    Verified,
    Blocked(&'static str),
    Sanitized,
}

pub fn sign_codebase_html(html: &str, secret_key: &str) -> TrustedHtml {
    let mut key_bytes = [0u8; 32];
    let secret_bytes = secret_key.as_bytes();
    for (i, b) in secret_bytes.iter().take(32).enumerate() {
        key_bytes[i] = *b;
    }
    let hash = blake3::keyed_hash(&key_bytes, html.as_bytes());
    TrustedHtml {
        html: html.to_string(),
        signature: hash.to_hex().to_string(),
        origin: "codebase".to_string(),
    }
}

pub fn verify_trusted_html(token: &TrustedHtml, secret_key: &str) -> bool {
    if token.origin != "codebase" && token.origin != "server" {
        return false;
    }
    let mut key_bytes = [0u8; 32];
    let secret_bytes = secret_key.as_bytes();
    for (i, b) in secret_bytes.iter().take(32).enumerate() {
        key_bytes[i] = *b;
    }
    let expected = blake3::keyed_hash(&key_bytes, token.html.as_bytes())
        .to_hex()
        .to_string();
    token.signature == expected
}

pub fn sanitize_html(raw: &str) -> String {
    let mut result = String::with_capacity(raw.len());
    let mut in_tag = false;
    let mut current_tag = String::new();

    let dangerous_tags = ["script", "iframe", "object", "embed", "style", "form"];

    let mut i = 0;
    let chars: Vec<char> = raw.chars().collect();
    let len = chars.len();

    while i < len {
        let ch = chars[i];
        if ch == '<' {
            in_tag = true;
            current_tag.clear();
            let mut j = i + 1;
            while j < len && chars[j] != '>' && !chars[j].is_whitespace() {
                current_tag.push(chars[j]);
                j += 1;
            }
            let tag_name = current_tag.trim_start_matches('/').to_ascii_lowercase();
            if dangerous_tags.contains(&tag_name.as_str()) {
                while i < len && chars[i] != '>' {
                    i += 1;
                }
                if i < len {
                    i += 1;
                }
                in_tag = false;
                continue;
            }
            result.push(ch);
        } else if ch == '>' {
            in_tag = false;
            while result.ends_with(' ') {
                result.pop();
            }
            result.push(ch);
        } else if in_tag {
            if ch == 'o' || ch == 'O' {
                let rest: String = chars[i..std::cmp::min(i + 15, len)].iter().collect();
                let lower_rest = rest.to_ascii_lowercase();
                if lower_rest.starts_with("onerror")
                    || lower_rest.starts_with("onload")
                    || lower_rest.starts_with("onclick")
                    || lower_rest.starts_with("onmouse")
                    || lower_rest.starts_with("onkey")
                {
                    while result.ends_with(' ') {
                        result.pop();
                    }
                    while i < len && chars[i] != '=' && chars[i] != '>' && !chars[i].is_whitespace()
                    {
                        i += 1;
                    }
                    while i < len && chars[i].is_whitespace() {
                        i += 1;
                    }
                    if i < len && chars[i] == '=' {
                        i += 1;
                        while i < len && chars[i].is_whitespace() {
                            i += 1;
                        }
                        if i < len && (chars[i] == '"' || chars[i] == '\'') {
                            let quote = chars[i];
                            i += 1;
                            while i < len && chars[i] != quote {
                                i += 1;
                            }
                            if i < len {
                                i += 1;
                            }
                        } else {
                            while i < len && chars[i] != '>' && !chars[i].is_whitespace() {
                                i += 1;
                            }
                        }
                    }
                    continue;
                }
            }
            if ch == 'j' || ch == 'J' {
                let rest: String = chars[i..std::cmp::min(i + 15, len)].iter().collect();
                let lower_rest = rest.to_ascii_lowercase();
                if lower_rest.starts_with("javascript:") {
                    result.push_str("about:blank");
                    i += "javascript:".len();
                    continue;
                }
            }
            result.push(ch);
        } else {
            result.push(ch);
        }
        i += 1;
    }

    result
}

pub fn escape_html(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '&' => escaped.push_str("&amp;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#x27;"),
            other => escaped.push(other),
        }
    }
    escaped
}

pub fn evaluate_safe_html(
    html: &str,
    is_browser: bool,
    trusted_token: Option<&TrustedHtml>,
    secret_key: &str,
) -> (String, HtmlSecurityStatus) {
    if is_browser {
        if let Some(token) = trusted_token {
            if verify_trusted_html(token, secret_key) {
                return (token.html.clone(), HtmlSecurityStatus::Verified);
            }
        }
        (
            escape_html(html),
            HtmlSecurityStatus::Blocked(
                "unauthenticated raw HTML injection blocked in browser context",
            ),
        )
    } else if let Some(token) = trusted_token {
        if verify_trusted_html(token, secret_key) {
            (token.html.clone(), HtmlSecurityStatus::Verified)
        } else {
            (sanitize_html(html), HtmlSecurityStatus::Sanitized)
        }
    } else {
        (sanitize_html(html), HtmlSecurityStatus::Sanitized)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signs_and_verifies_codebase_html() {
        let secret = "swift-rust-secret-test-key-12345";
        let token = sign_codebase_html("<article><h1>Hello</h1></article>", secret);
        assert!(verify_trusted_html(&token, secret));
        assert!(!verify_trusted_html(&token, "wrong-key"));
    }

    #[test]
    fn blocks_browser_unauthenticated_html() {
        let secret = "swift-rust-secret-test-key-12345";
        let malicious = "<script>alert('xss')</script><b>Hello</b>";
        let (output, status) = evaluate_safe_html(malicious, true, None, secret);
        assert_eq!(
            status,
            HtmlSecurityStatus::Blocked(
                "unauthenticated raw HTML injection blocked in browser context"
            )
        );
        assert!(!output.contains("<script>"));
        assert!(output.contains("&lt;script&gt;"));
    }

    #[test]
    fn allows_browser_when_cryptographically_signed_by_codebase() {
        let secret = "swift-rust-secret-test-key-12345";
        let raw = "<div class=\"hero\">Trusted Content</div>";
        let token = sign_codebase_html(raw, secret);
        let (output, status) = evaluate_safe_html(raw, true, Some(&token), secret);
        assert_eq!(status, HtmlSecurityStatus::Verified);
        assert_eq!(output, raw);
    }

    #[test]
    fn sanitizes_dangerous_tags_and_event_handlers() {
        let input = r#"<div onclick="steal()">Click me</div><script>fetch('/keys')</script><a href="javascript:alert(1)">Link</a>"#;
        let sanitized = sanitize_html(input);
        assert!(!sanitized.contains("<script>"));
        assert!(!sanitized.contains("onclick"));
        assert!(!sanitized.contains("javascript:"));
        assert!(sanitized.contains("<div>Click me</div>"));
        assert!(sanitized.contains("about:blank"));
    }
}
