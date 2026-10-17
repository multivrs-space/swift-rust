// Swift-Rust client navigator — turns full-page loads into SPA navigation for
// <a>/<Link>. Intercepts same-origin clicks, fetches the destination HTML,
// swaps <body>, re-runs body scripts (island bootstrap + serialized state),
// syncs <title>/meta, and manages history. Ships in dev and in the build
// output (NOT dev-only like the HMR client).
(() => {
  if (window.__SR_NAV__) return;
  const nav = (window.__SR_NAV__ = { cache: new Map(), inflight: new Map() });
  const ORIGIN = location.origin;
  const MAX_CACHE = 32;

  function internalAnchor(a) {
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return null;
    if (a.dataset.srNoNav !== undefined) return null;
    const raw = a.getAttribute("href");
    if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return null;
    let url;
    try {
      url = new URL(a.href, location.href);
    } catch {
      return null;
    }
    if (url.origin !== ORIGIN) return null;
    return url;
  }

  function remember(key, html) {
    if (nav.cache.size >= MAX_CACHE) nav.cache.delete(nav.cache.keys().next().value);
    nav.cache.set(key, html);
  }

  // Fetch (and cache) a route's HTML. Deduped per URL so prefetch + click share.
  function fetchDoc(url) {
    const fromPath = location.pathname;
    const key = fromPath + "->" + url;
    if (nav.cache.has(key)) return Promise.resolve(nav.cache.get(key));
    if (nav.inflight.has(key)) return nav.inflight.get(key);
    const p = fetch(url, {
      headers: { "x-swift-rust-nav": "1", "x-swift-rust-from": fromPath },
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok && res.status !== 404) throw new Error("nav fetch " + res.status);
        return res.text();
      })
      .then((html) => {
        remember(key, html);
        nav.inflight.delete(key);
        return html;
      })
      .catch((err) => {
        nav.inflight.delete(key);
        throw err;
      });
    nav.inflight.set(key, p);
    return p;
  }
  nav.prefetch = (url) => fetchDoc(new URL(url, location.href).href).catch(() => {});

  // Scripts inserted via DOM cloning don't execute; clone them into fresh nodes.
  // Classic scripts re-run on re-insertion, but ES module scripts are keyed by
  // URL in the module map and won't re-evaluate if the same src is inserted
  // again — which would leave the swapped-in island markup un-hydrated (stale
  // active states, dead event handlers) until a full reload. So we cache-bust
  // module src scripts with a per-navigation token to force re-execution.
  let swapToken = 0;
  function runScripts(root) {
    swapToken++;
    for (const old of root.querySelectorAll("script")) {
      const s = document.createElement("script");
      for (const att of old.attributes) s.setAttribute(att.name, att.value);
      if (s.type === "module" && s.src) {
        const u = new URL(s.src, location.href);
        u.searchParams.set("__srnav", String(swapToken));
        s.src = u.href;
      }
      s.textContent = old.textContent;
      old.replaceWith(s);
    }
  }

  // transition.tsx → wrap the DOM swap in the View Transitions API. Config is
  // injected as window.__SR_TRANSITION__ = { type, duration }. Falls back to a
  // plain swap when unsupported, type "none", or reduced-motion is requested.
  function injectTransitionStyle() {
    if (document.getElementById("__sr-transition-style")) return;
    const s = document.createElement("style");
    s.id = "__sr-transition-style";
    s.textContent =
      "::view-transition-old(root),::view-transition-new(root){animation-duration:var(--sr-transition-duration,250ms)}" +
      'html[data-sr-transition="slide"]::view-transition-old(root){animation-name:sr-vt-slide-out}' +
      'html[data-sr-transition="slide"]::view-transition-new(root){animation-name:sr-vt-slide-in}' +
      "@keyframes sr-vt-slide-out{to{opacity:0;transform:translateX(-24px)}}" +
      "@keyframes sr-vt-slide-in{from{opacity:0;transform:translateX(24px)}}";
    (document.head || document.documentElement).appendChild(s);
  }

  async function withTransition(apply) {
    const t = window.__SR_TRANSITION__;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!t || !t.type || t.type === "none" || reduce || typeof document.startViewTransition !== "function") {
      apply();
      return;
    }
    const root = document.documentElement;
    root.dataset.srTransition = t.type;
    if (t.duration) root.style.setProperty("--sr-transition-duration", t.duration + "ms");
    try {
      const vt = document.startViewTransition(() => apply());
      await vt.finished;
    } catch {
      // DOM was already updated inside the callback; nothing to recover.
    } finally {
      delete root.dataset.srTransition;
    }
  }

  function syncHead(doc) {
    const title = doc.querySelector("title");
    if (title) document.title = title.textContent || document.title;
    const selectors = [
      'meta[name="description"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
      'link[rel="canonical"]',
      'link[data-swift-rust-google-font]',
      'style[data-swift-rust-google-font]',
      'style[data-swift-rust-google-fonts]',
      'style[data-swift-rust-local-font]',
      'style[data-swift-rust-local-fonts]',
    ];
    for (const sel of selectors) {
      document.head.querySelectorAll(sel).forEach((m) => m.remove());
      doc.head.querySelectorAll(sel).forEach((m) => document.head.appendChild(m.cloneNode(true)));
    }
  }

  function preservedScrollElements(root = document) {
    return Array.from(root.querySelectorAll("[data-sr-scroll-preserve]"));
  }

  function scrollStorageKey(element, index) {
    const name = element.getAttribute("data-sr-scroll-preserve") || String(index);
    return `__sr_scroll_${name}`;
  }

  function capturePreservedScroll() {
    const positions = new Map();
    preservedScrollElements().forEach((element, index) => {
      const key = scrollStorageKey(element, index);
      positions.set(key, element.scrollTop);
      try {
        sessionStorage.setItem(key, String(element.scrollTop));
      } catch {}
    });
    return positions;
  }

  function restorePreservedScroll(positions = new Map()) {
    preservedScrollElements().forEach((element, index) => {
      const key = scrollStorageKey(element, index);
      let value = positions.get(key);
      if (value == null) {
        try {
          value = Number(sessionStorage.getItem(key));
        } catch {}
      }
      if (Number.isFinite(value)) element.scrollTop = value;
    });
  }

  // pending.tsx overlay: revealed only if a navigation outlasts the threshold,
  // so fast (cached) navigations don't flash it.
  let pendingTimer = null;
  function showPending() {
    const el = document.getElementById("__sr-pending");
    if (el) el.hidden = false;
  }
  function clearPending() {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    const el = document.getElementById("__sr-pending");
    if (el) el.hidden = true;
  }

  async function navigate(href, { push = true, scroll = true, replace = false } = {}) {
    let html;
    nav.active = href;
    if (pendingTimer) clearTimeout(pendingTimer);
    const delay = typeof window.__SR_NAV_PENDING_DELAY === "number" ? window.__SR_NAV_PENDING_DELAY : 120;
    pendingTimer = setTimeout(showPending, delay);
    window.dispatchEvent(new CustomEvent("sr:navigate-start", { detail: { url: href } }));
    try {
      html = await fetchDoc(href);
    } catch {
      location.href = href; // hard fallback
      return;
    }
    if (nav.active !== href) return; // superseded by a newer navigation
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.body) {
      location.href = href;
      return;
    }
    const preservedScroll = capturePreservedScroll();
    const apply = () => {
      document.body.replaceWith(doc.body);
      syncHead(doc);
      restorePreservedScroll(preservedScroll);
      runScripts(document.body);
    };
    await withTransition(apply);
    if (push) {
      if (replace) history.replaceState({ srNav: true }, "", href);
      else history.pushState({ srNav: true }, "", href);
    }
    if (scroll) window.scrollTo(0, 0);
    clearPending();
    window.dispatchEvent(new CustomEvent("sr:navigate-end", { detail: { url: href } }));
  }
  nav.navigate = navigate;

  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest("a");
      const url = internalAnchor(a);
      if (!url) return;
      e.preventDefault();
      if (url.href === location.href) return;
      navigate(url.href, {
        push: true,
        scroll: a.dataset.srScroll !== "false",
        replace: a.dataset.srReplace === "true",
      });
    },
    false,
  );

  window.addEventListener("popstate", () => {
    navigate(location.href, { push: false, scroll: false });
  });

  // ── Prefetch (prefetch.ts) ────────────────────────────────────────────────
  // Strategy comes from the per-route prefetch.ts, injected as
  // window.__SR_PREFETCH__ = { strategy, margin? }. Default: "hover".
  // Per-link opt-out via data-sr-prefetch="false".
  function strategy() {
    const c = window.__SR_PREFETCH__;
    return (c && c.strategy) || "hover";
  }
  function prefetchableURL(a) {
    if (!a || a.dataset.srPrefetch === "false") return null;
    return internalAnchor(a);
  }
  function intent(e) {
    if (strategy() !== "hover") return;
    const a = e.target.closest && e.target.closest("a");
    const url = prefetchableURL(a);
    if (url && url.href !== location.href) nav.prefetch(url.href);
  }
  document.addEventListener("mouseover", intent, { passive: true });
  document.addEventListener("focusin", intent);
  document.addEventListener("touchstart", intent, { passive: true });

  let io = null;
  function scanViewport() {
    if (io) {
      io.disconnect();
      io = null;
    }
    if (strategy() !== "viewport" || !("IntersectionObserver" in window)) return;
    const margin = (window.__SR_PREFETCH__ && window.__SR_PREFETCH__.margin) || "200px";
    io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const url = prefetchableURL(en.target);
          if (url && url.href !== location.href) nav.prefetch(url.href);
          io.unobserve(en.target);
        }
      },
      { rootMargin: margin },
    );
    document.querySelectorAll("a[href]").forEach((a) => {
      if (prefetchableURL(a)) io.observe(a);
    });
  }
  window.addEventListener("sr:navigate-end", scanViewport);
  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        restorePreservedScroll();
        scanViewport();
      },
      { once: true },
    );
  } else {
    restorePreservedScroll();
    scanViewport();
  }

  injectTransitionStyle();
})();
