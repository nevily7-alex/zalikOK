import Link from 'next/link';

export function Logo({ width = 160, priority = false }: { width?: number; priority?: boolean }) {
  const height = Math.round((width * 180) / 769);
  return (
    <Link href="/" className="logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/brand/logo-primary.svg"
        alt="ЗалікОк"
        width={width}
        height={height}
        fetchPriority={priority ? 'high' : undefined}
      />
    </Link>
  );
}
