/* eslint-disable @next/next/no-img-element */
export function Avatar({
  src,
  alt,
  size = 32,
  className = "",
}: {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}) {
  const url = src ? `${src}${src.includes("?") ? "&" : "?"}s=${size * 2}` : undefined;
  return url ? (
    <img
      src={url}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 rounded-full ring-1 ring-fg/10 ${className}`}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  ) : (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-fg/10 text-xs font-semibold uppercase text-fg/70 ring-1 ring-fg/10 ${className}`}
      style={{ width: size, height: size }}
    >
      {alt.slice(0, 1)}
    </span>
  );
}
