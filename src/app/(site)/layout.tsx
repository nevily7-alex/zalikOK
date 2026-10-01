import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { content } from '@/lib/content';

const nav = content.nav.map((n) => ({ label: n.label, href: n.href.startsWith('#') ? `/${n.href}` : n.href }));

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header nav={nav} cta={content.hero.primary} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}
