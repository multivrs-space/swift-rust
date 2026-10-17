pub mod jsc;
pub mod navigator;
pub mod safe_html;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
    let _ = console_log::init_with_level(log::Level::Debug);
    log::info!("swift-rust runtime started");
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HydrationData {
    pub route: String,
    pub props: serde_json::Value,
    pub state: serde_json::Value,
}

#[wasm_bindgen]
pub fn hydrate(payload: JsValue) -> Result<(), JsValue> {
    let data: HydrationData =
        serde_wasm_bindgen::from_value(payload).map_err(|e| JsValue::from_str(&e.to_string()))?;
    log::debug!("hydrating route={}", data.route);
    Ok(())
}

#[wasm_bindgen]
pub fn navigate(path: &str) {
    if let Some(window) = web_sys::window() {
        if let Ok(history) = window.history() {
            let _ = history.push_state_with_url(&JsValue::NULL, "", Some(path));
        }
    }
}
