#[cfg(target_os = "macos")]
use std::ffi::{CStr, CString};
#[cfg(target_os = "macos")]
use std::os::raw::{c_char, c_int, c_void};
#[cfg(target_os = "macos")]
use std::ptr;
use swift_rust_errors::{Error, Result};

#[cfg(target_os = "macos")]
#[link(name = "JavaScriptCore", kind = "framework")]
extern "C" {
    fn JSGlobalContextCreate(global_object_class: *const c_void) -> *mut c_void;
    fn JSGlobalContextRelease(ctx: *mut c_void);
    fn JSStringCreateWithUTF8CString(string: *const c_char) -> *mut c_void;
    fn JSStringRelease(string: *mut c_void);
    fn JSEvaluateScript(
        ctx: *mut c_void,
        script: *mut c_void,
        this_object: *mut c_void,
        source_url: *mut c_void,
        starting_line_number: c_int,
        exception: *mut *mut c_void,
    ) -> *mut c_void;
    fn JSValueToStringCopy(
        ctx: *mut c_void,
        value: *mut c_void,
        exception: *mut *mut c_void,
    ) -> *mut c_void;
    fn JSStringGetMaximumUTF8CStringSize(string: *mut c_void) -> usize;
    fn JSStringGetUTF8CString(
        string: *mut c_void,
        buffer: *mut c_char,
        buffer_size: usize,
    ) -> usize;
}

pub trait JsEngine: Send + Sync {
    fn eval(&self, script: &str) -> Result<String>;
}

pub struct JavaScriptCoreEngine {
    #[cfg(target_os = "macos")]
    ctx: *mut c_void,
}

unsafe impl Send for JavaScriptCoreEngine {}
unsafe impl Sync for JavaScriptCoreEngine {}

impl JavaScriptCoreEngine {
    pub fn new() -> Result<Self> {
        #[cfg(target_os = "macos")]
        {
            let ctx = unsafe { JSGlobalContextCreate(ptr::null()) };
            if ctx.is_null() {
                return Err(Error::Server {
                    message: "failed to create JavaScriptCore global context".to_string(),
                });
            }
            Ok(Self { ctx })
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(Self {})
        }
    }
}

impl Default for JavaScriptCoreEngine {
    fn default() -> Self {
        Self::new().expect("failed to initialize JavaScriptCore engine")
    }
}

impl Drop for JavaScriptCoreEngine {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        {
            if !self.ctx.is_null() {
                unsafe { JSGlobalContextRelease(self.ctx) };
            }
        }
    }
}

impl JsEngine for JavaScriptCoreEngine {
    fn eval(&self, script: &str) -> Result<String> {
        #[cfg(target_os = "macos")]
        {
            let c_script = CString::new(script).map_err(|e| Error::Server {
                message: format!("invalid script string: {e}"),
            })?;

            unsafe {
                let js_script = JSStringCreateWithUTF8CString(c_script.as_ptr());
                let mut exception: *mut c_void = ptr::null_mut();

                let js_val = JSEvaluateScript(
                    self.ctx,
                    js_script,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    1,
                    &mut exception,
                );

                JSStringRelease(js_script);

                if !exception.is_null() {
                    let err_str = JSValueToStringCopy(self.ctx, exception, ptr::null_mut());
                    let max_size = JSStringGetMaximumUTF8CStringSize(err_str);
                    let mut buf = vec![0u8; max_size];
                    JSStringGetUTF8CString(err_str, buf.as_mut_ptr() as *mut c_char, max_size);
                    JSStringRelease(err_str);
                    let msg = CStr::from_ptr(buf.as_ptr() as *const c_char)
                        .to_string_lossy()
                        .to_string();
                    return Err(Error::Server {
                        message: format!("JavaScript execution error: {msg}"),
                    });
                }

                if js_val.is_null() {
                    return Ok("undefined".to_string());
                }

                let js_str = JSValueToStringCopy(self.ctx, js_val, ptr::null_mut());
                let max_size = JSStringGetMaximumUTF8CStringSize(js_str);
                let mut buf = vec![0u8; max_size];
                JSStringGetUTF8CString(js_str, buf.as_mut_ptr() as *mut c_char, max_size);
                JSStringRelease(js_str);

                let result = CStr::from_ptr(buf.as_ptr() as *const c_char)
                    .to_string_lossy()
                    .to_string();

                Ok(result)
            }
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = script;
            Err(Error::Server {
                message: "JavaScriptCore C-FFI is available on macOS target".to_string(),
            })
        }
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn evaluates_math_expression() {
        let engine = JavaScriptCoreEngine::new().unwrap();
        let res = engine.eval("21 * 2").unwrap();
        assert_eq!(res, "42");
    }

    #[test]
    fn evaluates_json_stringify() {
        let engine = JavaScriptCoreEngine::new().unwrap();
        let res = engine
            .eval("JSON.stringify({ framework: 'swift-rust', speed: '10x' })")
            .unwrap();
        assert_eq!(res, r#"{"framework":"swift-rust","speed":"10x"}"#);
    }
}
