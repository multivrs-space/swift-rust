"use client";
import { type ChangeEvent, useState } from "react";
import { isYouTubeUrl, Video } from "swift-rust";

const YOUTUBE_URL = "https://youtu.be/rTJzsHwpZko?si=dyq6s5btq7MnASdS";
const YOUTUBE_ID = "rTJzsHwpZko";

const DETECTION_URLS = [
  YOUTUBE_URL,
  "https://www.youtube.com/watch?v=rTJzsHwpZko",
  "https://www.youtube.com/embed/rTJzsHwpZko",
  "https://www.youtube.com/shorts/rTJzsHwpZko",
  "https://example.com/clip.mp4",
  "https://vimeo.com/76979871",
  "not-a-url",
];

export default function VideosPage() {
  const [input, setInput] = useState(YOUTUBE_URL);
  const [detected, setDetected] = useState(true);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <div className="badge" style={{ marginBottom: "1rem" }}>
          Videos
        </div>
        <h1 style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>One component, one provider</h1>
        <p style={{ fontSize: "1.125rem", color: "var(--fg-muted)", maxWidth: "44rem" }}>
          Drop a YouTube URL, get an embed. Auto-detected, privacy-preserving, zero JavaScript
          required from your bundle.
        </p>
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          borderRadius: "0.75rem",
          padding: "0.75rem",
          maxWidth: "60rem",
        }}
      >
        <Video
          src={YOUTUBE_URL}
          width={960}
          height={540}
          style={{ width: "100%", borderRadius: "0.5rem", overflow: "hidden" }}
        />
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
          YouTube embed, auto-detected
        </h2>
        <p style={{ color: "var(--fg-muted)", maxWidth: "44rem" }}>
          The component inspects the URL, extracts the video ID, and switches to a
          privacy-preserving <code>youtube-nocookie</code> embed automatically. No provider config
          needed — paste, render, ship.
        </p>
      </div>

      <div className="code-block" style={{ marginTop: "1.5rem", maxWidth: "60rem" }}>
        <div className="code-block-header">
          <span>example.tsx</span>
        </div>
        <pre>
          <code>{`import { Video, isYouTubeUrl, getYouTubeId } from "swift-rust";

const url = "${YOUTUBE_URL}";

<Video
  src={url}
  width={960}
  height={540}
/>

isYouTubeUrl(url);   // → true
getYouTubeId(url);   // → "${YOUTUBE_ID}"`}</code>
        </pre>
      </div>

      <div className="section-title" style={{ marginTop: "4rem" }}>
        Auto-detection in action
      </div>
      <p style={{ color: "var(--fg-muted)", maxWidth: "44rem", marginBottom: "1.5rem" }}>
        The same <code>isYouTubeUrl</code> helper that powers the <code>Video</code> component is
        exported from <code>swift-rust</code>. Try a few URLs against the live detector:
      </p>
      <div
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          maxWidth: "60rem",
        }}
      >
        <label
          htmlFor="video-url-input"
          style={{
            display: "block",
            fontSize: "0.7rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--fg-subtle)",
          }}
        >
          URL
        </label>
        <input
          id="video-url-input"
          type="text"
          value={input}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setInput(e.target.value);
            try {
              const u = new URL(e.target.value);
              setDetected(u.hostname === "youtu.be" || u.hostname.endsWith("youtube.com"));
            } catch {
              setDetected(false);
            }
          }}
          spellCheck={false}
          style={{
            marginTop: "0.5rem",
            width: "100%",
            padding: "0.5rem 0.75rem",
            fontFamily: "var(--font-mono, ui-monospace)",
            fontSize: "0.85rem",
            background: "var(--bg)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            outline: "none",
          }}
        />
        <div
          style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.75rem" }}
        >
          {detected ? (
            <span
              className="badge"
              style={{ background: "var(--accent)", color: "var(--accent-fg)", border: 0 }}
            >
              YouTube
            </span>
          ) : (
            <span
              className="badge"
              style={{ background: "var(--bg-elevated, var(--surface))", color: "var(--fg-muted)" }}
            >
              Not YouTube
            </span>
          )}
          <code
            style={{
              fontFamily: "var(--font-mono, ui-monospace)",
              fontSize: "0.75rem",
              color: "var(--fg-subtle)",
            }}
          >
            isYouTubeUrl("{input}") → {String(detected)}
          </code>
        </div>
      </div>

      <div
        style={{
          marginTop: "2rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 28rem), 1fr))",
          gap: "0.75rem",
          maxWidth: "60rem",
        }}
      >
        {DETECTION_URLS.map((url) => {
          let yt = false;
          try {
            const u = new URL(url);
            yt = u.hostname === "youtu.be" || u.hostname.endsWith("youtube.com");
          } catch {
            yt = false;
          }
          return (
            <div
              key={url}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                background: "var(--surface)",
              }}
            >
              <code
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: "var(--font-mono, ui-monospace)",
                  fontSize: "0.8rem",
                  color: "var(--fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {url}
              </code>
              {yt ? (
                <span
                  className="badge"
                  style={{ background: "var(--accent)", color: "var(--accent-fg)", border: 0 }}
                >
                  YouTube
                </span>
              ) : (
                <span className="badge" style={{ color: "var(--fg-muted)" }}>
                  —
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-title" style={{ marginTop: "4rem" }}>
        Helper functions
      </div>
      <p style={{ color: "var(--fg-muted)", maxWidth: "44rem", marginBottom: "1.5rem" }}>
        Need to know what kind of URL you have, or build an embed URL yourself? These utilities are
        exported from <code>swift-rust</code>.
      </p>
      <div className="code-block" style={{ maxWidth: "60rem" }}>
        <div className="code-block-header">
          <span>helpers.ts</span>
        </div>
        <pre>
          <code>{`import {
  isYouTubeUrl,
  getYouTubeId,
  detectProvider,
  getYouTubeEmbedUrl,
} from "swift-rust";

const url = "${YOUTUBE_URL}";

isYouTubeUrl(url);                       // → true
getYouTubeId(url);                       // → "${YOUTUBE_ID}"
detectProvider(url);                     // → "youtube"
getYouTubeEmbedUrl("${YOUTUBE_ID}", { autoPlay: true, mute: true });
// → "https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&mute=1"`}</code>
        </pre>
      </div>
    </div>
  );
}
