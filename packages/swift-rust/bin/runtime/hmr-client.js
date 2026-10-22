(function () {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return;

  var PREFS_KEY = "sr:devtools";
  var HIDDEN_KEY = "sr:devtools-hidden";
  var ACTIVITY_KEY = "sr:activity";
  var SIZES = [36, 48, 56];
  var es = new EventSource("/_swift-rust/hmr");
  var seenOpen = false;
  var connected = false;
  var busy = false;
  var open = false;
  var view = "menu";
  var host = null;
  var shadow = null;
  var clientIssues = [];
  var serverIssues = [];
  var vitals = { ttfb: null, fcp: null, lcp: null, cls: 0, inp: null };
  var outlineOn = false;
  var highlightEl = null;

  function prefs() {
    var base = { theme: "dark", position: "bottom-left", size: 48, glass: "solid" };
    try {
      return Object.assign(base, JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"));
    } catch (e) {
      return base;
    }
  }
  function savePrefs(next) {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    applyChrome();
  }
  function hidden() {
    return sessionStorage.getItem(HIDDEN_KEY) === "1";
  }
  function readInfo() {
    var el = document.getElementById("__sr_dev_info");
    if (!el) return null;
    try {
      return JSON.parse(el.textContent);
    } catch (e) {
      return null;
    }
  }
  function allowed() {
    var info = readInfo();
    return !info || info.devIndicators !== false;
  }
  function onErrorPage() {
    return document.documentElement.hasAttribute("data-sr-error-page") || !!document.querySelector("[data-sr-error-page]");
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function tick(s) {
    return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  function loadActivity() {
    try {
      return JSON.parse(sessionStorage.getItem(ACTIVITY_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }
  function note(kind, detail) {
    var list = loadActivity();
    list.unshift({ t: Date.now(), kind: kind, detail: detail });
    sessionStorage.setItem(ACTIVITY_KEY, JSON.stringify(list.slice(0, 40)));
    if (open && view === "activity") renderPanel();
  }
  function toast(text) {
    if (!shadow) return;
    var el = shadow.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      el.classList.remove("show");
    }, 1600);
  }
  function copyText(text, label) {
    var done = function () {
      toast(label || "Copied");
    };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { toast("Copy failed"); });
    else toast("Copy failed");
  }
  function issueKey(d) {
    var loc = d && d.location;
    return [d && d.code, d && d.title, loc && loc.file, loc && loc.line].join("|");
  }
  function allIssues() {
    var seen = {};
    var out = [];
    serverIssues.concat(clientIssues).forEach(function (d) {
      if (!d) return;
      var key = issueKey(d);
      if (seen[key]) return;
      seen[key] = 1;
      out.push(d);
    });
    return out;
  }
  function addClientIssue(d) {
    d.source = d.source || "client";
    clientIssues = [d].concat(clientIssues.filter(function (x) { return issueKey(x) !== issueKey(d); })).slice(0, 20);
    updateBadge();
    if (open && view === "issues") renderPanel();
  }
  function logo(size) {
    return (
      '<svg class="logo" width="' + size + '" height="' + size + '" viewBox="0 0 32 32" aria-hidden="true">' +
      '<g class="rays" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">' +
      '<circle cx="16" cy="16" r="6.4"/>' +
      '<path d="M16 4.4v2.6M16 25v2.6M4.4 16h2.6M25 16h2.6M7.9 7.9l1.8 1.8M22.3 22.3l1.8 1.8M7.9 24.1l1.8-1.8M22.3 9.7l1.8-1.8"/>' +
      "</g>" +
      '<path d="M17.8 9.3 L11.6 17 H15.2 L14.2 22.8 L20.4 15 H16.8 Z" fill="#fb923c"/>' +
      "</svg>"
    );
  }
  function css() {
    return (
      ":host{position:fixed;z-index:2147483646;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:var(--fg);--fg:#f4f4f5;--muted:#a1a1aa;--line:rgba(255,255,255,.12);--panel:rgba(12,12,14,.78);--code:#18181b;--add:#bbf7d0;--del:#fecaca;--accent:#fb923c}" +
      ":host([data-theme=light]){--fg:#18181b;--muted:#52525b;--line:rgba(0,0,0,.1);--panel:rgba(255,255,255,.86);--code:#f4f4f5;--add:#166534;--del:#991b1b}" +
      ":host(.pos-bl){left:16px;bottom:16px}:host(.pos-br){right:16px;bottom:16px}:host(.pos-tl){left:16px;top:16px}:host(.pos-tr){right:16px;top:16px}" +
      "#anchor{position:relative;display:inline-block}" +
      ".trigger{appearance:none;-webkit-appearance:none;position:relative;display:grid;place-items:center;padding:0;border-radius:999px;cursor:pointer;color:var(--mark,#fff);" +
      "background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.38);box-shadow:0 8px 24px rgba(0,0,0,.18);transition:transform .12s ease}" +
      ".logo{filter:drop-shadow(0 0 1px rgba(0,0,0,.65)) drop-shadow(0 0 1px rgba(255,255,255,.45))}" +
      ".trigger:hover{transform:translateY(-1px)}" +
      ":host([data-glass=clear]) .trigger{background:rgba(255,255,255,.12);-webkit-backdrop-filter:blur(3px) saturate(1.15);backdrop-filter:blur(3px) saturate(1.15)}" +
      ":host([data-glass=frosted]) .trigger{background:rgba(10,10,12,.42);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}" +
      ":host([data-glass=solid]) .trigger{background:#111;border-color:#2a2a2a;-webkit-backdrop-filter:none;backdrop-filter:none}" +
      ".trigger.off{opacity:.5}.logo .rays{transform-origin:16px 16px}.trigger.busy .rays{animation:spin .9s linear infinite}" +
      "@keyframes spin{to{transform:rotate(360deg)}}" +
      ".badge{display:none;position:absolute;top:-1px;right:-1px;min-width:12px;height:12px;padding:0 3px;border-radius:999px;background:#ef4444;color:#fff;font-size:8px;font-weight:700;line-height:12px;text-align:center;box-shadow:0 0 0 1.5px #111}" +
      ".badge.on{display:block}.badge.warn{background:#eab308;color:#111}" +
      ".panel{position:absolute;width:360px;max-height:min(72vh,580px);display:none;flex-direction:column;border-radius:16px;overflow:hidden;border:1px solid var(--line);" +
      "background:var(--panel);-webkit-backdrop-filter:blur(10px) saturate(1.2);backdrop-filter:blur(10px) saturate(1.2);box-shadow:0 18px 50px rgba(0,0,0,.35);color:var(--fg)}" +
      ":host([data-glass=solid]) .panel{background:#111;-webkit-backdrop-filter:none;backdrop-filter:none}" +
      ".panel.show{display:flex}.above{bottom:calc(100% + 10px)}.below{top:calc(100% + 10px)}.align-l{left:0}.align-r{right:0}" +
      ".hd{display:flex;align-items:center;gap:8px;padding:12px 12px 10px;border-bottom:1px solid var(--line)}" +
      ".hd b{font-size:13px}.hd .sub{margin-left:auto;color:var(--muted);font-size:11px}" +
      ".back{border:0;background:transparent;color:var(--fg);cursor:pointer;font-size:16px;padding:0 4px}" +
      ".body{overflow:auto;padding:6px}" +
      ".row,.item{width:100%;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;border-radius:10px;padding:9px 10px;display:flex;align-items:center;gap:10px;font-size:13px}" +
      ".row:hover,.item:hover{background:rgba(127,127,127,.12)}.row .k{margin-left:auto;color:var(--muted);font-size:11px}" +
      ".ico{width:22px;text-align:center;color:var(--accent)}" +
      ".ft{display:flex;gap:6px;padding:8px;border-top:1px solid var(--line)}" +
      ".ft button{flex:1;border:1px solid var(--line);background:transparent;color:inherit;border-radius:9px;padding:7px 6px;font-size:11px;cursor:pointer}" +
      ".ft button:hover{background:rgba(127,127,127,.12)}" +
      ".card{border:1px solid var(--line);border-radius:12px;padding:10px;margin:6px;font-size:12px;line-height:1.45}" +
      ".card h3{margin:4px 0 6px;font-size:13px;font-weight:650}.meta{color:var(--muted);font-size:11px}" +
      ".chip{display:inline-block;border-radius:999px;padding:1px 7px;font-size:10px;font-weight:700;letter-spacing:.04em;background:rgba(239,68,68,.15);color:#f87171;margin-right:6px}" +
      ".chip.warn{background:rgba(251,146,60,.15);color:var(--accent)}.loc{font-family:ui-monospace,monospace;font-size:11px;color:var(--muted)}" +
      ".diff{margin:8px 0;border-radius:8px;overflow:hidden;background:var(--code);font-family:ui-monospace,monospace;font-size:11px}" +
      ".diff div{padding:2px 8px;white-space:pre-wrap}.diff .add{color:var(--add)}.diff .del{color:var(--del)}" +
      ".actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.actions button,.actions a{border:1px solid var(--line);background:transparent;color:inherit;border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;text-decoration:none}" +
      "code{font-family:ui-monospace,monospace;font-size:.92em}.empty{padding:22px 12px;text-align:center;color:var(--muted);font-size:12px}" +
      ".tree{font-family:ui-monospace,monospace;font-size:12px}.tree button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:4px 8px;cursor:pointer;border-radius:6px}.tree button:hover{background:rgba(127,127,127,.12)}" +
      ".metric{display:flex;justify-content:space-between;padding:7px 10px;font-size:12px}.metric b{font-variant-numeric:tabular-nums}" +
      ".good{color:#4ade80}.mid{color:#fbbf24}.bad{color:#f87171}" +
      ".seg{display:flex;gap:4px;padding:4px}.seg button{flex:1;border:1px solid var(--line);background:transparent;color:inherit;border-radius:8px;padding:6px;font-size:11px;cursor:pointer}.seg button.on{background:var(--accent);color:#111;border-color:transparent}" +
      ".toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111;color:#fff;border-radius:999px;padding:7px 12px;font-size:12px;opacity:0;pointer-events:none;transition:opacity .15s}" +
      ".toast.show{opacity:1}.hl{position:fixed;pointer-events:none;border:2px solid #fb923c;border-radius:8px;z-index:2147483645;box-shadow:0 0 0 4px rgba(251,146,60,.25)}"
    );
  }

  function mount() {
    if (host || !allowed() || hidden()) return;
    host = document.createElement("div");
    host.id = "__sr_devwidget";
    host.setAttribute("data-sr-dev", "");
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" + css() + "</style>" +
      '<div id="anchor"><div id="panel" class="panel"></div>' +
      '<button id="trigger" class="trigger" type="button" aria-label="Swift Rust dev tools">' + logo(26) + "</button>" +
      '<span id="badge" class="badge"></span></div>' +
      '<div id="toast" class="toast"></div>';
    document.documentElement.appendChild(host);
    applyChrome();
    shadow.getElementById("trigger").addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!open);
    });
    shadow.addEventListener("click", onPanelClick);
    updateBadge();
    sampleContrast();
    pullIssues();
  }
  function unmount() {
    if (host) host.remove();
    host = null;
    shadow = null;
    open = false;
  }
  function applyChrome() {
    if (!host || !shadow) return;
    var p = prefs();
    var theme = p.theme;
    if (theme === "system") theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    host.dataset.theme = theme;
    host.dataset.glass = p.glass || "clear";
    host.className = "pos-" + ({ "bottom-left": "bl", "bottom-right": "br", "top-left": "tl", "top-right": "tr" }[p.position] || "bl");
    var btn = shadow.getElementById("trigger");
    btn.style.width = btn.style.height = p.size + "px";
    btn.classList.toggle("off", !connected);
    btn.classList.toggle("busy", busy);
    var panel = shadow.getElementById("panel");
    var bottom = p.position.indexOf("bottom") === 0;
    var right = p.position.indexOf("right") !== -1;
    panel.className = "panel" + (open ? " show" : "") + (bottom ? " above" : " below") + (right ? " align-r" : " align-l");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    sampleContrast();
  }
  function sampleContrast() {
    if (!host) return;
    var rect = host.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + Math.min(rect.height / 2, (prefs().size || 48) / 2);
    var prev = host.style.pointerEvents;
    host.style.pointerEvents = "none";
    var stack = document.elementsFromPoint(x, y);
    host.style.pointerEvents = prev;
    var mark = "#fff";
    for (var i = 0; i < stack.length; i++) {
      var bg = getComputedStyle(stack[i]).backgroundColor;
      var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
      if (!m) continue;
      var alpha = m[4] == null ? 1 : parseFloat(m[4]);
      if (alpha < 0.45) continue;
      var lum = (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
      mark = lum > 0.62 ? "#111" : "#fff";
      break;
    }
    host.style.setProperty("--mark", mark);
  }
  function setOpen(next) {
    open = next;
    if (open && view === "menu") view = "menu";
    applyChrome();
    if (open) {
      pullIssues();
      renderPanel();
    }
  }
  function updateBadge() {
    if (!shadow) return;
    var list = allIssues();
    var errors = 0;
    var warnings = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].severity === "warning") warnings++;
      else errors++;
    }
    var n = errors + warnings;
    var badge = shadow.getElementById("badge");
    var warningsOnly = n > 0 && errors === 0;
    badge.classList.toggle("on", n > 0);
    badge.classList.toggle("warn", warningsOnly);
    badge.textContent = n > 9 ? "9+" : n ? String(errors || warnings) : "";
  }
  function renderPanel() {
    if (!shadow) return;
    var panel = shadow.getElementById("panel");
    var info = readInfo() || {};
    panel.innerHTML = view === "menu" ? menuHtml(info) : viewHtml(info);
  }
  function menuHtml(info) {
    var n = allIssues().length;
    var render = info.render || "static";
    var rows = [
      ["issues", "Issues", n ? String(n) : "None"],
      ["route", "Route", info.route || location.pathname],
      ["perf", "Performance", render.toUpperCase()],
      ["islands", "Islands", String(document.querySelectorAll("[data-sr-island]").length)],
      ["activity", "Activity", ""],
      ["tools", "Tools", ""],
      ["prefs", "Preferences", ""],
    ];
    return (
      headHtml("Swift Rust", info.version ? "v" + info.version : "dev") +
      '<div class="body">' +
      rows.map(function (r) {
        return '<button class="row" data-go="' + r[0] + '"><span class="ico">›</span><span>' + r[1] + '</span><span class="k">' + esc(r[2]) + "</span></button>";
      }).join("") +
      "</div>" + footerHtml()
    );
  }
  function headHtml(title, sub, back) {
    return (
      '<div class="hd">' +
      (back ? '<button class="back" data-go="menu" aria-label="Back">←</button>' : logo(18)) +
      "<b>" + esc(title) + "</b>" +
      (sub ? '<span class="sub">' + esc(sub) + "</span>" : "") +
      "</div>"
    );
  }
  function footerHtml() {
    var info = readInfo() || {};
    var restart = info.supervised ? "" : " title=\"Start with swift-rust dev to enable restart\"";
    return (
      '<div class="ft">' +
      '<button data-act="reload">Reload</button>' +
      '<button data-act="cache">Clear cache</button>' +
      "<button data-act=\"restart\"" + restart + ">Restart</button>" +
      "</div>"
    );
  }
  function viewHtml(info) {
    if (view === "issues") return issuesHtml();
    if (view === "route") return routeHtml(info);
    if (view === "perf") return perfHtml(info);
    if (view === "islands") return islandsHtml();
    if (view === "activity") return activityHtml();
    if (view === "tools") return toolsHtml(info);
    if (view === "prefs") return prefsHtml();
    return menuHtml(info);
  }
  function issuesHtml() {
    var list = allIssues();
    var cards = list.length
      ? list.map(function (d, i) {
          var loc = d.location;
          var where = loc && loc.file ? loc.file + ":" + (loc.line || 1) + ":" + (loc.column || 1) : "";
          var helps = (d.helps || []).map(function (h) {
            var diff = (h.diff || []).map(function (l) {
              return '<div class="' + (l.type === "+" ? "add" : "del") + '">' + esc(l.type + " " + l.text) + "</div>";
            }).join("");
            return "<div><div>" + tick(h.message) + "</div>" +
              (h.command ? "<code>" + esc(h.command) + "</code>" : "") +
              (diff ? '<div class="diff">' + diff + "</div>" : "") +
              (h.snippet ? "<pre class=\"diff\"><div>" + esc(h.snippet) + "</div></pre>" : "") +
              "</div>";
          }).join("");
          return (
            '<article class="card">' +
            '<div class="meta"><span class="chip' + (d.severity === "warning" ? " warn" : "") + '">' + esc(d.code || d.kind || "error") + "</span>" + esc(d.kind || "") + "</div>" +
            "<h3>" + tick(d.title || d.message || "Error") + "</h3>" +
            (where ? '<div class="loc">' + esc(where) + "</div>" : "") +
            helps +
            '<div class="actions">' +
            (where ? '<button data-open="' + esc(loc.file) + '" data-line="' + (loc.line || 1) + '" data-col="' + (loc.column || 1) + '">Open</button>' : "") +
            '<button data-copy-issue="' + i + '">Copy for AI</button>' +
            (d.docs ? '<a href="' + esc(d.docs) + '" target="_blank" rel="noreferrer">Docs</a>' : "") +
            "</div></article>"
          );
        }).join("")
      : '<div class="empty">No issues on this page.</div>';
    return headHtml("Issues", String(list.length), true) + '<div class="body">' + cards + "</div>" + footerHtml();
  }
  function routeHtml(info) {
    var files = info.files || [];
    var tree = files.length
      ? '<div class="tree">' + files.map(function (f) {
          return '<button data-open="' + esc(f.file) + '" data-line="1" data-col="1">' + esc(f.kind) + "  " + esc(f.file) + "</button>";
        }).join("") + "</div>"
      : '<div class="empty">Route files appear after the next render.</div>';
    return headHtml("Route", info.route || location.pathname, true) +
      '<div class="body"><div class="metric"><span>Render</span><b>' + esc(info.render || "—") + "</b></div>" +
      '<div class="metric"><span>Runtime</span><b>' + esc(info.runtime || "bun") + "</b></div>" +
      '<div class="metric"><span>Client page</span><b>' + (info.clientPage ? "yes" : "no") + "</b></div>" +
      tree + "</div>" + footerHtml();
  }
  function rating(name, value) {
    if (value == null) return "";
    var limits = { ttfb: [800, 1800], fcp: [1800, 3000], lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };
    var pair = limits[name] || [1, 2];
    var cls = value <= pair[0] ? "good" : value <= pair[1] ? "mid" : "bad";
    var text = name === "cls" ? value.toFixed(3) : Math.round(value) + " ms";
    return '<div class="metric"><span>' + name.toUpperCase() + '</span><b class="' + cls + '">' + text + "</b></div>";
  }
  function perfHtml(info) {
    var t = info.timings || {};
    var nav = performance.getEntriesByType("navigation")[0];
    var nodes = document.getElementsByTagName("*").length;
    var reqs = performance.getEntriesByType("resource").length;
    return headHtml("Performance", "", true) + '<div class="body">' +
      '<div class="metric"><span>Compile</span><b>' + (t.compile != null ? Math.round(t.compile) + " ms" : "—") + "</b></div>" +
      '<div class="metric"><span>Render</span><b>' + (t.render != null ? Math.round(t.render) + " ms" : "—") + "</b></div>" +
      '<div class="metric"><span>Total</span><b>' + (t.total != null ? Math.round(t.total) + " ms" : "—") + "</b></div>" +
      rating("ttfb", nav ? nav.responseStart : vitals.ttfb) +
      rating("fcp", vitals.fcp) + rating("lcp", vitals.lcp) + rating("cls", vitals.cls) + rating("inp", vitals.inp) +
      '<div class="metric"><span>DOM nodes</span><b>' + nodes + "</b></div>" +
      '<div class="metric"><span>Requests</span><b>' + reqs + "</b></div>" +
      "</div>" + footerHtml();
  }
  function islandsHtml() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-sr-island]"));
    var list = nodes.length
      ? nodes.map(function (el, i) {
          var src = el.getAttribute("data-sr-island-src") || el.getAttribute("data-sr-island") || "island";
          var exp = el.getAttribute("data-sr-island-export") || "default";
          return '<button class="item" data-island="' + i + '"><span class="ico">◇</span><span>' + esc(exp) + '<div class="meta">' + esc(src.split("/").slice(-2).join("/")) + "</div></span></button>";
        }).join("")
      : '<div class="empty">This page has no client islands.</div>';
    return headHtml("Islands", String(nodes.length), true) + '<div class="body">' + list + "</div>" + footerHtml();
  }
  function activityHtml() {
    var list = loadActivity();
    var rows = list.length
      ? list.map(function (a) {
          var time = new Date(a.t).toLocaleTimeString();
          return '<div class="metric"><span>' + esc(a.kind) + " · " + esc(a.detail || "") + "</span><b>" + esc(time) + "</b></div>";
        }).join("")
      : '<div class="empty">Saves and reloads show up here.</div>';
    return headHtml("Activity", "", true) + '<div class="body">' + rows + "</div>" + footerHtml();
  }
  function toolsHtml() {
    var w = window.innerWidth;
    var bp = w < 640 ? "sm" : w < 768 ? "md" : w < 1024 ? "lg" : w < 1280 ? "xl" : "2xl";
    return headHtml("Tools", w + "px · " + bp, true) + '<div class="body">' +
      '<button class="row" data-act="outline"><span class="ico">▢</span><span>Outline elements</span><span class="k">' + (outlineOn ? "On" : "Off") + "</span></button>" +
      '<button class="row" data-act="copy-page"><span class="ico">⎘</span><span>Copy page info</span></button>' +
      '<div class="empty">⌥⇧D toggles this panel. Outlines and the island flash are dev-only.</div>' +
      "</div>" + footerHtml();
  }
  function prefsHtml() {
    var p = prefs();
    function seg(name, options) {
      return '<div class="seg" data-pref="' + name + '">' + options.map(function (o) {
        var on = String(p[name]) === String(o[0]);
        return '<button data-set="' + name + '" data-value="' + o[0] + '"' + (on ? ' class="on"' : "") + ">" + o[1] + "</button>";
      }).join("") + "</div>";
    }
    return headHtml("Preferences", "", true) + '<div class="body">' +
      '<div class="meta" style="padding:8px 10px 2px">Theme</div>' + seg("theme", [["dark", "Dark"], ["light", "Light"], ["system", "System"]]) +
      '<div class="meta" style="padding:8px 10px 2px">Position</div>' + seg("position", [["bottom-left", "BL"], ["bottom-right", "BR"], ["top-left", "TL"], ["top-right", "TR"]]) +
      '<div class="meta" style="padding:8px 10px 2px">Size</div>' + seg("size", SIZES.map(function (n) { return [n, n === 36 ? "S" : n === 48 ? "M" : "L"]; })) +
      '<div class="meta" style="padding:8px 10px 2px">Glass</div>' + seg("glass", [["clear", "Clear"], ["frosted", "Frosted"], ["solid", "Solid"]]) +
      '<button class="row" data-act="hide"><span>Hide for this session</span></button>' +
      '<div class="empty">To turn the indicator off, set "devIndicators": false in swift-rust.config.json.</div>' +
      "</div>" + footerHtml();
  }
  function onPanelClick(e) {
    var t = e.target.closest("[data-go],[data-act],[data-open],[data-copy-issue],[data-set],[data-island]");
    if (!t) return;
    e.stopPropagation();
    if (t.hasAttribute("data-go")) {
      view = t.getAttribute("data-go");
      renderPanel();
      return;
    }
    if (t.hasAttribute("data-set")) {
      var next = prefs();
      var key = t.getAttribute("data-set");
      var value = t.getAttribute("data-value");
      next[key] = key === "size" ? Number(value) : value;
      savePrefs(next);
      renderPanel();
      return;
    }
    if (t.hasAttribute("data-open")) {
      var q = "file=" + encodeURIComponent(t.getAttribute("data-open")) + "&line=" + (t.getAttribute("data-line") || 1) + "&column=" + (t.getAttribute("data-col") || 1);
      fetch("/_swift-rust/open-editor?" + q, { method: "POST" }).then(function (r) { return r.json(); }).then(function (j) {
        toast(j.ok ? "Opened in " + j.editor : (j.error || "Could not open editor"));
      }, function () { toast("Could not open editor"); });
      return;
    }
    if (t.hasAttribute("data-copy-issue")) {
      var d = allIssues()[Number(t.getAttribute("data-copy-issue"))];
      copyText(d && d.markdown ? d.markdown : JSON.stringify(d, null, 2), "Copied error as Markdown");
      return;
    }
    if (t.hasAttribute("data-island")) {
      var node = document.querySelectorAll("[data-sr-island]")[Number(t.getAttribute("data-island"))];
      flash(node);
      return;
    }
    var act = t.getAttribute("data-act");
    if (act === "reload") location.reload();
    if (act === "cache") {
      fetch("/_swift-rust/clear-cache", { method: "POST" }).then(function (r) { return r.json(); }).then(function () {
        toast("Cache cleared");
      }, function () { toast("Could not clear cache"); });
    }
    if (act === "restart") {
      fetch("/_swift-rust/restart", { method: "POST" }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
        toast(res.ok ? "Restarting…" : (res.j.error || "Restart unavailable"));
      }, function () { toast("Restart unavailable"); });
    }
    if (act === "outline") {
      outlineOn = !outlineOn;
      var style = document.getElementById("__sr_outline");
      if (outlineOn) {
        if (!style) {
          style = document.createElement("style");
          style.id = "__sr_outline";
          style.textContent = "body *{outline:1px solid rgba(251,146,60,.55)!important;outline-offset:-1px}";
          document.documentElement.appendChild(style);
        }
      } else if (style) style.remove();
      renderPanel();
    }
    if (act === "copy-page") {
      var info = readInfo() || {};
      copyText(JSON.stringify({ url: location.href, route: info.route, render: info.render, runtime: info.runtime, files: info.files, timings: info.timings }, null, 2), "Copied page info");
    }
    if (act === "hide") {
      sessionStorage.setItem(HIDDEN_KEY, "1");
      unmount();
      toast("Hidden until reload · ⌥⇧D shows it again");
    }
  }
  function flash(node) {
    if (!node) return;
    if (highlightEl) highlightEl.remove();
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    var r = node.getBoundingClientRect();
    highlightEl = document.createElement("div");
    highlightEl.className = "hl";
    highlightEl.style.cssText = "position:fixed;pointer-events:none;z-index:2147483645;border:2px solid #fb923c;border-radius:8px;box-shadow:0 0 0 4px rgba(251,146,60,.25);left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px;";
    document.documentElement.appendChild(highlightEl);
    setTimeout(function () {
      if (highlightEl) highlightEl.remove();
      highlightEl = null;
    }, 1600);
  }
  function pullIssues() {
    fetch("/_swift-rust/issues").then(function (r) { return r.json(); }).then(function (list) {
      if (Array.isArray(list)) serverIssues = list;
      updateBadge();
      if (open && view === "issues") renderPanel();
    }).catch(function () {});
  }

  function handlePayload(raw) {
    try {
      var msg = JSON.parse(raw);
      var data = msg && msg.event && msg.data ? msg.data : msg;
      if (data.type === "reload") {
        busy = true;
        applyChrome();
        note("reload", data.reason || data.file || "");
        if (!onErrorPage()) toast("Reloading…");
        setTimeout(function () { location.reload(); }, 80);
      } else if (data.type === "error") {
        note("error", data.message || "");
        if (data.diagnostic) addClientIssue(Object.assign({ source: "hmr" }, data.diagnostic));
        else addClientIssue({ source: "hmr", title: data.message || "Build error", kind: "compile", severity: "error" });
        if (!onErrorPage()) toast(data.message || "Error");
      } else if (data.type === "ok") {
        clientIssues = clientIssues.filter(function (d) { return d.source !== "hmr"; });
        updateBadge();
        note("ok", "recovered");
        if (!onErrorPage()) toast("Recovered");
      }
    } catch (err) {
      console.error("[swift-rust] bad HMR payload", err);
    }
  }
  es.addEventListener("message", function (e) { handlePayload(e.data); });
  es.addEventListener("change", function (e) { handlePayload(e.data); });
  es.addEventListener("open", function () {
    connected = true;
    applyChrome();
    if (seenOpen) location.reload();
    seenOpen = true;
  });
  es.addEventListener("error", function () {
    connected = false;
    applyChrome();
  });

  window.addEventListener("error", function (e) {
    if (!e.message || /Script error/.test(e.message)) return;
    addClientIssue({
      title: e.message,
      kind: "runtime",
      severity: "error",
      location: e.filename ? { file: e.filename, line: e.lineno, column: e.colno } : null,
      stack: e.error && e.error.stack,
    });
  });
  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason;
    addClientIssue({
      title: (reason && reason.message) || String(reason),
      kind: "runtime",
      severity: "error",
      stack: reason && reason.stack,
    });
  });
  var originalError = console.error;
  console.error = function () {
    originalError.apply(console, arguments);
    var text = Array.prototype.map.call(arguments, function (x) { return String(x && x.message ? x.message : x); }).join(" ");
    if (/hydrat|did not match|text content does not match|server html/i.test(text)) {
      addClientIssue({ code: "SR0133", title: text.slice(0, 280), kind: "hydration", severity: "error" });
    }
  };

  try {
    var nav = performance.getEntriesByType("navigation")[0];
    if (nav) vitals.ttfb = nav.responseStart;
    var paintObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.name === "first-contentful-paint") vitals.fcp = entry.startTime;
      });
    });
    paintObs.observe({ type: "paint", buffered: true });
    var lcpObs = new PerformanceObserver(function (list) {
      var entries = list.getEntries();
      vitals.lcp = entries[entries.length - 1].startTime;
    });
    lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
    var clsObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (!entry.hadRecentInput) vitals.cls += entry.value;
      });
    });
    clsObs.observe({ type: "layout-shift", buffered: true });
    var inpObs = new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (entry) {
        if (entry.duration > (vitals.inp || 0)) vitals.inp = entry.duration;
      });
    });
    inpObs.observe({ type: "event", buffered: true, durationThreshold: 40 });
  } catch (e) {}

  window.addEventListener("sr:navigate-start", function () {
    busy = true;
    applyChrome();
  });
  window.addEventListener("sr:navigate-end", function () {
    busy = false;
    if (!allowed()) {
      unmount();
      return;
    }
    if (!host && !hidden()) mount();
    applyChrome();
    pullIssues();
    if (open) renderPanel();
    sampleContrast();
  });
  document.addEventListener("click", function (e) {
    if (!open || !host) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) !== -1) return;
    setOpen(false);
  });
  document.addEventListener("keydown", function (e) {
    var toggle = e.altKey && e.shiftKey && (e.key === "D" || e.key === "d");
    if (toggle) {
      if (!allowed()) return;
      e.preventDefault();
      if (hidden() || !host) {
        sessionStorage.removeItem(HIDDEN_KEY);
        mount();
        view = "menu";
        setOpen(true);
        return;
      }
      setOpen(!open);
    }
    if (e.key === "Escape" && open) setOpen(false);
  });

  window.__SR_DEVTOOLS__ = {
    isOpen: function () { return open; },
  };

  if (allowed() && !hidden()) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
    else mount();
  }
  setInterval(function () {
    if (host) {
      pullIssues();
      sampleContrast();
    }
  }, 4000);
})();
