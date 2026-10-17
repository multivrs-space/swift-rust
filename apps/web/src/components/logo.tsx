import { BLUR_TRANSPARENT } from "@/lib/blur";
import Image from "swift-rust/image";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 leading-none ${className}`}>
      <Image
        src="/favicon.svg"
        alt=""
        aria-hidden
        width={26}
        height={26}
        placeholder="blur"
        blurDataURL={BLUR_TRANSPARENT}
        loader={({ src }) => src}
        className="h-6.5 w-6.5 shrink-0 rounded-[6px]"
      />
      <span className="font-display text-[1.025rem] font-bold leading-none tracking-tight text-fg">
        swift<span className="text-accent">·</span>rust
      </span>
    </span>
  );
}
