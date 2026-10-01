export function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="section-title">
      <span>{children}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="accent" src="/assets/decor/accent-rays.svg" alt="" width={32} height={32} loading="lazy" />
    </h2>
  );
}
