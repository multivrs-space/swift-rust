export type RenderingMode = "ssr" | "ssr-wasm" | "ssr-htmx" | "wasm";

export interface ImageConfig {
  domains?: string[];
  formats?: string[];
  deviceSizes?: number[];
  imageSizes?: number[];
  minimumCacheTTL?: number;
}

export interface FontConfig {
  subsets?: string[];
  display?: "auto" | "block" | "swap" | "fallback" | "optional";
  preload?: boolean;
  adjustFontFallback?: boolean;
  fallback?: string[];
}

export interface PdfConfig {
  defaultPageSize?: "A4" | "A3" | "Letter" | "Legal" | "Tabloid";
  defaultOrientation?: "portrait" | "landscape";
  compress?: boolean;
}

export interface SwiftRustConfig {
  rendering?: RenderingMode;
  image?: ImageConfig;
  font?: FontConfig;
  pdf?: PdfConfig;
}

export function defineConfig(config: SwiftRustConfig): SwiftRustConfig {
  return config;
}

export type Metadata = {
  title?: string | { template: string; default: string };
  description?: string;
  openGraph?: {
    title?: string;
    description?: string;
    type?: string;
    url?: string;
    images?: Array<{ url: string; width?: number; height?: number; alt?: string }>;
  };
  twitter?: {
    card?: "summary" | "summary_large_image";
    title?: string;
    description?: string;
    images?: string[];
  };
  robots?: { index?: boolean; follow?: boolean };
  alternates?: { canonical?: string };
  icons?: { icon?: string; apple?: string };
};

export type {
  FontDisplay,
  FontOptions,
  FontStyle,
  FontSubset,
  FontWeight,
  LoadedFont,
  LocalFontOptions,
  LocalFontSource,
} from "@swift-rust/font";
export {
  ALL_LOCAL_FONT_PATHS,
  ALL_LOCAL_FONTS,
  DX_SLIGHT_PATHS,
  DxSlight,
  DxSlightExtBdUltraSlant,
  DxSlightMediumUltra,
  LAUSANNE_PATHS,
  Lausanne,
  localFont,
  localFontCss,
  VARENT_PATHS,
  VarentGrotesk,
  VarentGroteskBold,
  VarentGroteskExtLtIta,
  ZIMULA_PATHS,
  Zimula,
} from "@swift-rust/font";
export type { ImageFormat, ImageProps } from "@swift-rust/image";
export { Image } from "@swift-rust/image";
export type {
  DocumentProps,
  Orientation,
  PageProps as PdfPageProps,
  PageSize,
  TextProps,
  ViewProps,
} from "@swift-rust/pdf";
export { Document, Page, Text, View } from "@swift-rust/pdf";
export type { FormProps, ServerAction } from "./action";
export { createServerAction, Form } from "./action";
export type { CacheEntry, CacheOptions } from "./cache";
export { cache, clearCache, revalidatePath, revalidateTag } from "./cache";
export type { HeadProps as MetaHeadProps } from "./head";
export { Head, Meta, Style, Title } from "./head";
export type { LinkProps as LinkComponentProps } from "./link";
export { Link } from "./link";
export type { LayoutProps, PageProps, RouteHandler, RouteHandlerContext } from "./router";
export { NotFoundError, notFound, permanentRedirect, RedirectError, redirect } from "./router";
export type { SafeHtmlProps, TrustedHtml } from "./safe-html";
export {
  createTrustedHtml,
  isTrustedHtml,
  SafeHtml,
  sanitizeHtml,
  TRUSTED_HTML_SYMBOL,
} from "./safe-html";
export type { ScriptProps, ScriptStrategy } from "./script";
export { Script } from "./script";
export type {
  BackgroundVideoProps,
  VideoCaption,
  VideoLightboxProps,
  VideoPreload,
  VideoProps,
  VideoProvider,
  VideoSource,
} from "./video";
export {
  BackgroundVideo,
  detectProvider,
  getVimeoEmbedUrl,
  getVimeoId,
  getYouTubeEmbedUrl,
  getYouTubeId,
  isVimeoUrl,
  isYouTubeUrl,
  Video,
  VideoLightbox,
} from "./video";
