import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PdfErrorKind = "load" | "render" | "invalid" | "network" | "cancelled";

export class PdfError extends Error {
  override readonly name = "PdfError";
  readonly code: "SR0152" | "SR0153";
  readonly kind: PdfErrorKind;
  override readonly cause?: unknown;
  readonly url?: string;

  constructor(
    kind: PdfErrorKind,
    message: string,
    options: { cause?: unknown; url?: string } = {},
  ) {
    super(message);
    this.kind = kind;
    this.code = kind === "render" ? "SR0153" : "SR0152";
    this.cause = options.cause;
    this.url = options.url;
  }
}

export type PdfSource = string | { url: string; data?: ArrayBuffer | Uint8Array };

export type PdfScale = number | "fit-width" | "fit-page";

export interface PdfLoadInfo {
  numPages: number;
  title?: string;
  author?: string;
  subject?: string;
  fingerprint?: string;
}

export interface PdfProps {
  src: PdfSource;
  width?: number | string;
  height?: number | string;
  initialPage?: number;
  initialScale?: PdfScale;
  showControls?: boolean;
  showPageNumbers?: boolean;
  showThumbnails?: boolean;
  renderTextLayer?: boolean;
  className?: string;
  style?: CSSProperties;
  workerSrc?: string;
  cMapUrl?: string;
  onLoad?: (info: PdfLoadInfo) => void;
  onPageChange?: (page: number) => void;
  onError?: (error: PdfError) => void;
  loading?: ReactNode;
  fallback?: ReactNode;
  errorFallback?: ReactNode | ((err: PdfError) => ReactNode);
  children?: ReactNode;
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  getMetadata: () => Promise<PdfMetadata>;
  destroy: () => Promise<void>;
}

interface PdfPage {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
  getTextContent: () => Promise<{ items: Array<{ str: string }> }>;
  cleanup: () => void;
}

interface PdfMetadata {
  Title?: string;
  Author?: string;
  Subject?: string;
  info?: { Title?: string; Author?: string; Subject?: string };
  contentDispositionFilename?: string;
}

interface PdfJsModule {
  getDocument: (src: string | { url: string; data?: ArrayBuffer | Uint8Array }) => {
    promise: Promise<PdfDoc>;
  };
  GlobalWorkerOptions: { workerSrc: string };
  version?: string;
}

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(workerSrc: string | undefined): Promise<PdfJsModule> {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const mod = (await import("pdfjs-dist")) as unknown as PdfJsModule;
    if (workerSrc) {
      mod.GlobalWorkerOptions.workerSrc = workerSrc;
    } else if (!mod.GlobalWorkerOptions.workerSrc) {
      try {
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        mod.GlobalWorkerOptions.workerSrc = workerUrl;
      } catch {
        mod.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${mod.version ?? "6.4.299"}/build/pdf.worker.min.mjs`;
      }
    }
    return mod;
  })();
  return pdfjsPromise;
}

function defaultWorkerSrc(): string {
  return "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs";
}

function resolveSourceUrl(src: PdfSource): string {
  return typeof src === "string" ? src : src.url;
}

function clampScale(scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, scale));
}

function useIsomorphicLayoutEffect(fn: () => undefined | (() => void), deps: unknown[]): void {
  const isBrowser = typeof window !== "undefined";
  if (isBrowser) {
    // biome-ignore lint: isBrowser is environment-constant, so exactly one branch runs for the app's lifetime; deps are forwarded from the caller by design.
    useEffect(fn, deps);
  } else {
    // biome-ignore lint: isBrowser is environment-constant, so exactly one branch runs for the app's lifetime; deps are forwarded from the caller by design.
    useMemo(fn, deps);
  }
}

export function Pdf(props: PdfProps) {
  const {
    src,
    width = "100%",
    height = 720,
    initialPage = 1,
    initialScale = "fit-width",
    showControls = true,
    showPageNumbers = true,
    // biome-ignore lint/correctness/noUnusedVariables: accepted prop, not yet rendered
    showThumbnails = false,
    renderTextLayer = false,
    className,
    style,
    workerSrc,
    onLoad,
    onPageChange,
    onError,
    loading,
    fallback,
    errorFallback,
  } = props;

  const isBrowser = typeof window !== "undefined";
  const sourceUrl = resolveSourceUrl(src);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const docRef = useRef<PdfDoc | null>(null);

  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [loadError, setLoadError] = useState<PdfError | null>(null);
  const [page, setPage] = useState<number>(initialPage);
  const [scaleMode, setScaleMode] = useState<PdfScale>(initialScale);
  const [actualScale, setActualScale] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>(String(initialPage));

  useEffect(() => {
    if (!isBrowser) return;
    let cancelled = false;
    setDoc(null);
    setLoadError(null);

    (async () => {
      try {
        const pdfjs = await loadPdfJs(workerSrc ?? defaultWorkerSrc());
        const task = pdfjs.getDocument(
          typeof src === "string" ? src : { url: src.url, data: src.data },
        );
        const loaded = await task.promise;
        if (cancelled) {
          await loaded.destroy().catch(() => {});
          return;
        }
        docRef.current = loaded;
        setDoc(loaded);
        setPage((p) => Math.min(Math.max(1, p), loaded.numPages));
        setPageInput(String(Math.min(Math.max(1, initialPage), loaded.numPages)));
        try {
          const meta = await loaded.getMetadata();
          const info: PdfLoadInfo = {
            numPages: loaded.numPages,
            title: meta.info?.Title ?? meta.Title,
            author: meta.info?.Author ?? meta.Author,
            subject: meta.info?.Subject ?? meta.Subject,
          };
          onLoad?.(info);
        } catch {
          onLoad?.({ numPages: loaded.numPages });
        }
      } catch (err) {
        if (cancelled) return;
        const e = classifyLoadError(err, sourceUrl);
        setLoadError(e);
        onError?.(e);
      }
    })();

    return () => {
      cancelled = true;
      const d = docRef.current;
      docRef.current = null;
      if (d) {
        d.destroy().catch(() => {});
      }
    };
  }, [isBrowser, sourceUrl, src, workerSrc, onLoad, onError, initialPage]);

  useIsomorphicLayoutEffect(() => {
    if (!doc || !canvasRef.current || !isBrowser) return;
    let cancelled = false;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;

    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled) {
          pdfPage.cleanup();
          return;
        }
        const containerWidth = canvasRef.current?.parentElement?.clientWidth ?? 0;
        const unscaledViewport = pdfPage.getViewport({ scale: 1 });
        let nextScale = 1;
        if (scaleMode === "fit-width" && containerWidth > 0) {
          nextScale = clampScale(containerWidth / unscaledViewport.width, 0.25, 4);
        } else if (scaleMode === "fit-page") {
          const containerHeight = (containerRef.current?.clientHeight ?? 0) - 40;
          const ratioW = containerWidth > 0 ? containerWidth / unscaledViewport.width : 1;
          const ratioH = containerHeight > 0 ? containerHeight / unscaledViewport.height : 1;
          nextScale = clampScale(Math.min(ratioW, ratioH), 0.25, 4);
        } else {
          nextScale = clampScale(typeof scaleMode === "number" ? scaleMode : 1, 0.25, 4);
        }
        const viewport = pdfPage.getViewport({ scale: nextScale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) {
          pdfPage.cleanup();
          return;
        }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          pdfPage.cleanup();
          throw new PdfError("render", "Failed to acquire 2D context", { url: sourceUrl });
        }
        ctx.scale(dpr, dpr);
        const task = pdfPage.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task as unknown as { cancel: () => void };
        await task.promise;
        if (cancelled) {
          pdfPage.cleanup();
          return;
        }
        if (renderTextLayer) {
          await pdfPage.getTextContent().catch(() => ({ items: [] }));
        }
        pdfPage.cleanup();
        setActualScale(nextScale);
      } catch (err) {
        if (cancelled) return;
        const e = new PdfError("render", err instanceof Error ? err.message : "PDF render failed", {
          cause: err,
          url: sourceUrl,
        });
        onError?.(e);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [doc, page, scaleMode, renderTextLayer, isBrowser, sourceUrl, onError]);

  const goPrev = useCallback(() => {
    setPage((p) => {
      const next = Math.max(1, p - 1);
      setPageInput(String(next));
      onPageChange?.(next);
      return next;
    });
  }, [onPageChange]);

  const goNext = useCallback(() => {
    setPage((p) => {
      const next = Math.min(doc?.numPages ?? p + 1, p + 1);
      setPageInput(String(next));
      onPageChange?.(next);
      return next;
    });
  }, [doc, onPageChange]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          goNext();
          break;
        case "Home":
          e.preventDefault();
          setPage(1);
          setPageInput("1");
          onPageChange?.(1);
          break;
        case "End":
          if (doc) {
            e.preventDefault();
            setPage(doc.numPages);
            setPageInput(String(doc.numPages));
            onPageChange?.(doc.numPages);
          }
          break;
        case "+":
        case "=":
          e.preventDefault();
          setScaleMode((s) => clampScale(typeof s === "number" ? s : actualScale * 1.25, 0.25, 4));
          break;
        case "-":
        case "_":
          e.preventDefault();
          setScaleMode((s) => clampScale(typeof s === "number" ? s : actualScale * 0.8, 0.25, 4));
          break;
      }
    },
    [doc, goPrev, goNext, actualScale, onPageChange],
  );

  const submitPage = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const n = Number.parseInt(pageInput, 10);
      if (!Number.isFinite(n) || !doc) return;
      const clamped = Math.min(Math.max(1, n), doc.numPages);
      setPage(clamped);
      setPageInput(String(clamped));
      onPageChange?.(clamped);
    },
    [pageInput, doc, onPageChange],
  );

  const retry = useCallback(() => {
    setLoadError(null);
    setDoc(null);
    setPage(initialPage);
    setPageInput(String(initialPage));
  }, [initialPage]);

  if (!isBrowser) {
    if (fallback) return createElement("div", { className, style }, fallback);
    return createElement(
      "a",
      {
        href: sourceUrl,
        target: "_blank",
        rel: "noopener noreferrer",
        className: ["__swift_rust_pdf_fallback", className].filter(Boolean).join(" "),
        style: { display: "block", padding: "2rem", textAlign: "center", ...style },
      },
      `View PDF (${sourceUrl})`,
    );
  }

  if (loadError) {
    if (errorFallback) {
      const node = typeof errorFallback === "function" ? errorFallback(loadError) : errorFallback;
      return createElement("div", { className, style }, node);
    }
    return createElement(
      "div",
      {
        role: "alert",
        className: ["__swift_rust_pdf __swift_rust_pdf_error", className].filter(Boolean).join(" "),
        style: {
          padding: "1.5rem",
          border: "1px solid rgba(220, 38, 38, 0.3)",
          borderRadius: "0.5rem",
          background: "rgba(220, 38, 38, 0.05)",
          color: "rgb(127, 29, 29)",
          ...style,
        },
      },
      createElement("strong", null, `Failed to load PDF (${loadError.code})`),
      createElement("p", { style: { margin: "0.5rem 0 1rem" } }, loadError.message),
      createElement(
        "div",
        { style: { display: "flex", gap: "0.5rem" } },
        createElement(
          "button",
          {
            type: "button",
            onClick: retry,
            style: {
              padding: "0.4rem 0.8rem",
              border: "1px solid currentColor",
              borderRadius: "0.25rem",
              background: "transparent",
              cursor: "pointer",
            },
          },
          "Retry",
        ),
        createElement(
          "a",
          {
            href: sourceUrl,
            target: "_blank",
            rel: "noopener noreferrer",
            style: {
              padding: "0.4rem 0.8rem",
              border: "1px solid currentColor",
              borderRadius: "0.25rem",
              textDecoration: "none",
            },
          },
          "Open in new tab",
        ),
      ),
    );
  }

  return createElement(
    "div",
    {
      ref: containerRef,
      className: ["__swift_rust_pdf", className].filter(Boolean).join(" "),
      tabIndex: 0,
      role: "region",
      "aria-label": "PDF viewer",
      onKeyDown,
      style: {
        display: "flex",
        flexDirection: "column",
        width,
        height,
        background: "rgb(245, 245, 244)",
        border: "1px solid rgba(0, 0, 0, 0.1)",
        borderRadius: "0.5rem",
        overflow: "hidden",
        outline: "none",
        ...style,
      },
    },
    showControls && doc
      ? createElement(
          "div",
          {
            className: "__swift_rust_pdf_controls",
            style: {
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0.75rem",
              borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
              background: "white",
              fontSize: "0.875rem",
            },
          },
          createElement(
            "button",
            {
              type: "button",
              onClick: goPrev,
              disabled: page <= 1,
              "aria-label": "Previous page",
              style: btn,
            },
            "\u2039",
          ),
          showPageNumbers
            ? createElement(
                "form",
                {
                  onSubmit: submitPage,
                  style: { display: "flex", alignItems: "center", gap: "0.25rem" },
                },
                createElement("input", {
                  "aria-label": "Page number",
                  type: "number",
                  min: 1,
                  max: doc.numPages,
                  value: pageInput,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setPageInput(e.target.value),
                  style: {
                    width: "3.5rem",
                    padding: "0.2rem 0.4rem",
                    border: "1px solid rgba(0, 0, 0, 0.2)",
                    borderRadius: "0.25rem",
                  },
                }),
                createElement("span", null, `/ ${doc.numPages}`),
              )
            : createElement("span", null, `${page} / ${doc.numPages}`),
          createElement(
            "button",
            {
              type: "button",
              onClick: goNext,
              disabled: page >= doc.numPages,
              "aria-label": "Next page",
              style: btn,
            },
            "\u203A",
          ),
          createElement("div", { style: { flex: 1 } }),
          createElement(
            "button",
            {
              type: "button",
              onClick: () => setScaleMode("fit-width"),
              "aria-label": "Fit width",
              style: btn,
            },
            "Fit",
          ),
          createElement(
            "button",
            {
              type: "button",
              onClick: () =>
                setScaleMode((s) =>
                  clampScale((typeof s === "number" ? s : actualScale) - 0.25, 0.25, 4),
                ),
              "aria-label": "Zoom out",
              style: btn,
            },
            "\u2212",
          ),
          createElement(
            "span",
            { "aria-label": "Current scale", style: { minWidth: "3rem", textAlign: "center" } },
            `${Math.round(actualScale * 100)}%`,
          ),
          createElement(
            "button",
            {
              type: "button",
              onClick: () =>
                setScaleMode((s) =>
                  clampScale((typeof s === "number" ? s : actualScale) + 0.25, 0.25, 4),
                ),
              "aria-label": "Zoom in",
              style: btn,
            },
            "+",
          ),
          createElement(
            "a",
            {
              href: sourceUrl,
              target: "_blank",
              rel: "noopener noreferrer",
              style: { ...btn, textDecoration: "none" },
            },
            "Open",
          ),
        )
      : null,
    createElement(
      "div",
      {
        className: "__swift_rust_pdf_canvas_wrap",
        style: {
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "1rem",
        },
      },
      doc
        ? createElement("canvas", {
            ref: canvasRef,
            className: "__swift_rust_pdf_canvas",
            "aria-label": `Page ${page}`,
          })
        : loading
          ? createElement(
              "div",
              { style: { padding: "2rem", color: "rgb(115, 115, 115)" } },
              loading,
            )
          : createElement(
              "div",
              { style: { padding: "2rem", color: "rgb(115, 115, 115)" } },
              "Loading PDF\u2026",
            ),
    ),
  );
}

const btn: CSSProperties = {
  padding: "0.25rem 0.6rem",
  border: "1px solid rgba(0, 0, 0, 0.15)",
  borderRadius: "0.25rem",
  background: "white",
  cursor: "pointer",
  fontSize: "0.875rem",
  lineHeight: 1,
  color: "inherit",
};

function classifyLoadError(err: unknown, url: string): PdfError {
  if (err instanceof PdfError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/network|fetch|CORS|InvalidPDF|password/i.test(message)) {
    return new PdfError(
      err instanceof Error && /InvalidPDF|password/i.test(message) ? "invalid" : "network",
      message,
      { cause: err, url },
    );
  }
  return new PdfError("load", message, { cause: err, url });
}

export default Pdf;
