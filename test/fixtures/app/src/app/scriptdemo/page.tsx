import { Script } from "swift-rust";

export default function ScriptDemo() {
  return (
    <div>
      <Script id="analytics" strategy="afterInteractive">
        {`console.log("analytics loaded")`}
      </Script>
      <h1>Script Demo</h1>
    </div>
  );
}
