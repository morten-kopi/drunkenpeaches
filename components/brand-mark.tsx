import Image from "next/image";
import { cn } from "@/lib/utils";

const MARK_PX = { sm: 28, default: 32, lg: 72 } as const;

/**
 * The Drunken Peaches mark: a peach with a glass of wine. The glass is filled
 * white in the asset so it reads on light, dark and burgundy surfaces. Full
 * logo with wordmark: public/brand/drunken-peaches-logo.png.
 */
export function BrandMark({
  className,
  size = "default",
}: {
  className?: string;
  size?: keyof typeof MARK_PX;
}) {
  const px = MARK_PX[size];
  return (
    <Image
      src="/brand/drunken-peaches-mark.png"
      alt=""
      aria-hidden
      width={px}
      height={px}
      className={cn("shrink-0 select-none", className)}
    />
  );
}

export function BrandWordmark({
  className,
  name = "Drunken Peaches",
  size = "default",
}: {
  className?: string;
  name?: string;
  size?: "sm" | "default";
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark size={size === "sm" ? "sm" : "default"} />
      <span
        className={cn(
          "font-heading tracking-tight text-foreground",
          size === "sm" ? "text-base" : "text-lg"
        )}
      >
        {name}
      </span>
    </span>
  );
}
