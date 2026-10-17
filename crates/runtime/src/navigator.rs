use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;

static PREFETCHED_CACHE: Lazy<RwLock<HashSet<String>>> = Lazy::new(|| RwLock::new(HashSet::new()));

pub struct NavigationDecision {
    pub should_intercept: bool,
    pub target_url: Option<String>,
}

pub fn should_intercept_click(
    href: Option<&str>,
    target_attr: Option<&str>,
    has_download: bool,
    is_modified: bool,
    current_origin: &str,
    current_path: &str,
) -> NavigationDecision {
    if is_modified || has_download {
        return NavigationDecision {
            should_intercept: false,
            target_url: None,
        };
    }

    if let Some(target) = target_attr {
        if target == "_blank" || target == "_parent" || target == "_top" {
            return NavigationDecision {
                should_intercept: false,
                target_url: None,
            };
        }
    }

    let raw_href = match href {
        Some(h) if !h.is_empty() => h,
        _ => {
            return NavigationDecision {
                should_intercept: false,
                target_url: None,
            }
        }
    };

    if raw_href.starts_with('#')
        || raw_href.starts_with("javascript:")
        || raw_href.starts_with("mailto:")
        || raw_href.starts_with("tel:")
    {
        return NavigationDecision {
            should_intercept: false,
            target_url: None,
        };
    }

    if raw_href.starts_with("http://") || raw_href.starts_with("https://") {
        if let Ok(parsed) = url::Url::parse(raw_href) {
            let origin = parsed.origin().ascii_serialization();
            if origin != current_origin {
                return NavigationDecision {
                    should_intercept: false,
                    target_url: None,
                };
            }
            let path_and_query = if let Some(query) = parsed.query() {
                format!("{}?{}", parsed.path(), query)
            } else {
                parsed.path().to_string()
            };
            if path_and_query == current_path {
                return NavigationDecision {
                    should_intercept: false,
                    target_url: None,
                };
            }
            return NavigationDecision {
                should_intercept: true,
                target_url: Some(path_and_query),
            };
        }
    }

    if raw_href.starts_with('/') {
        if raw_href == current_path {
            return NavigationDecision {
                should_intercept: false,
                target_url: None,
            };
        }
        return NavigationDecision {
            should_intercept: true,
            target_url: Some(raw_href.to_string()),
        };
    }

    NavigationDecision {
        should_intercept: false,
        target_url: None,
    }
}

#[wasm_bindgen]
pub fn init_wasm_navigator() -> Result<(), JsValue> {
    let window = web_sys::window().ok_or_else(|| JsValue::from_str("no window found"))?;
    let document = window
        .document()
        .ok_or_else(|| JsValue::from_str("no document found"))?;

    let click_closure = Closure::wrap(Box::new(move |event: web_sys::MouseEvent| {
        let is_modified =
            event.meta_key() || event.ctrl_key() || event.shift_key() || event.alt_key();
        if event.button() != 0 {
            return;
        }

        let target = match event.target() {
            Some(t) => t,
            None => return,
        };

        let node = match target.dyn_into::<web_sys::Node>() {
            Ok(n) => n,
            Err(_) => return,
        };

        let mut curr = Some(node);
        while let Some(n) = curr {
            if let Ok(el) = n.clone().dyn_into::<web_sys::Element>() {
                if el.tag_name().eq_ignore_ascii_case("a") {
                    if let Ok(anchor) = el.dyn_into::<web_sys::HtmlAnchorElement>() {
                        let href = anchor.get_attribute("href");
                        let target_attr = anchor.get_attribute("target");
                        let has_download = anchor.has_attribute("download");

                        if let Some(win) = web_sys::window() {
                            let origin = win.location().origin().unwrap_or_default();
                            let pathname = win.location().pathname().unwrap_or_default();
                            let decision = should_intercept_click(
                                href.as_deref(),
                                target_attr.as_deref(),
                                has_download,
                                is_modified,
                                &origin,
                                &pathname,
                            );
                            if decision.should_intercept {
                                if let Some(dest) = decision.target_url {
                                    event.prevent_default();
                                    navigate_to(&dest);
                                }
                            }
                        }
                    }
                    break;
                }
            }
            curr = n.parent_node();
        }
    }) as Box<dyn FnMut(_)>);

    document.add_event_listener_with_callback("click", click_closure.as_ref().unchecked_ref())?;
    click_closure.forget();

    let popstate_closure = Closure::wrap(Box::new(move |_event: web_sys::PopStateEvent| {
        if let Some(win) = web_sys::window() {
            let path = win
                .location()
                .pathname()
                .unwrap_or_else(|_| "/".to_string());
            let _ = dispatch_nav_event(&path, false);
        }
    }) as Box<dyn FnMut(_)>);

    window
        .add_event_listener_with_callback("popstate", popstate_closure.as_ref().unchecked_ref())?;
    popstate_closure.forget();

    Ok(())
}

#[wasm_bindgen]
pub fn navigate_to(path: &str) {
    if let Some(window) = web_sys::window() {
        if let Ok(history) = window.history() {
            let _ = history.push_state_with_url(&JsValue::NULL, "", Some(path));
            window.scroll_to_with_x_and_y(0.0, 0.0);
            let _ = dispatch_nav_event(path, true);
        }
    }
}

#[wasm_bindgen]
pub fn prefetch_path(path: &str) -> bool {
    let mut cache = PREFETCHED_CACHE.write();
    if cache.contains(path) {
        false
    } else {
        cache.insert(path.to_string());
        true
    }
}

#[wasm_bindgen]
pub fn get_current_path() -> String {
    if let Some(win) = web_sys::window() {
        win.location()
            .pathname()
            .unwrap_or_else(|_| "/".to_string())
    } else {
        "/".to_string()
    }
}

fn dispatch_nav_event(path: &str, is_push: bool) -> Result<(), JsValue> {
    if let Some(win) = web_sys::window() {
        let detail = js_sys::Object::new();
        js_sys::Reflect::set(&detail, &"path".into(), &JsValue::from_str(path))?;
        js_sys::Reflect::set(&detail, &"push".into(), &JsValue::from_bool(is_push))?;

        let event_init = web_sys::CustomEventInit::new();
        event_init.set_bubbles(true);
        event_init.set_cancelable(true);
        event_init.set_detail(&detail);

        let event =
            web_sys::CustomEvent::new_with_event_init_dict("swift-rust:navigate", &event_init)?;
        win.dispatch_event(&event)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intercepts_internal_relative_links() {
        let dec = should_intercept_click(
            Some("/dashboard"),
            None,
            false,
            false,
            "http://localhost:3000",
            "/",
        );
        assert!(dec.should_intercept);
        assert_eq!(dec.target_url, Some("/dashboard".to_string()));
    }

    #[test]
    fn ignores_same_page_navigation() {
        let dec = should_intercept_click(
            Some("/dashboard"),
            None,
            false,
            false,
            "http://localhost:3000",
            "/dashboard",
        );
        assert!(!dec.should_intercept);
    }

    #[test]
    fn ignores_modified_clicks() {
        let dec = should_intercept_click(
            Some("/about"),
            None,
            false,
            true,
            "http://localhost:3000",
            "/",
        );
        assert!(!dec.should_intercept);
    }

    #[test]
    fn ignores_target_blank() {
        let dec = should_intercept_click(
            Some("/external"),
            Some("_blank"),
            false,
            false,
            "http://localhost:3000",
            "/",
        );
        assert!(!dec.should_intercept);
    }

    #[test]
    fn ignores_different_origin() {
        let dec = should_intercept_click(
            Some("https://google.com/search"),
            None,
            false,
            false,
            "http://localhost:3000",
            "/",
        );
        assert!(!dec.should_intercept);
    }

    #[test]
    fn prefetch_deduplicates() {
        assert!(prefetch_path("/feed"));
        assert!(!prefetch_path("/feed"));
    }
}
