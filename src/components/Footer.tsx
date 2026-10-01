import Link from 'next/link';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { content } from '@/lib/content';
import { emailHref, getSiteConfig, phoneHref, telegramHref } from '@/lib/site-config';

export function Footer() {
  const config = getSiteConfig();
  const tg = telegramHref(config);
  const mail = emailHref(config);
  const tel = phoneHref(config);
  const hasContacts = Boolean(tg || mail || tel);
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <Logo width={140} />
          <p>{content.footer.description}</p>
        </div>

        <nav aria-label="Навігація у футері" className="site-footer__nav">
          {content.nav
            .filter((n) => n.href !== '#contacts')
            .map((n) => (
              <Link key={n.href} href={n.href.startsWith('#') ? `/${n.href}` : n.href}>
                {n.label}
              </Link>
            ))}
          <Link href="/#contacts">Контакти</Link>
        </nav>

        <div id="contacts" className="site-footer__contacts">
          <h2 className="site-footer__heading">Контакти</h2>
          {hasContacts ? (
            <ul>
              {tg && (
                <li>
                  <a href={tg} target="_blank" rel="noopener noreferrer">
                    <Icon name="telegram" /> Telegram
                  </a>
                </li>
              )}
              {mail && (
                <li>
                  <a href={mail}>
                    <Icon name="email" /> {config.email}
                  </a>
                </li>
              )}
              {tel && (
                <li>
                  <a href={tel}>
                    <Icon name="phone" /> {config.phone}
                  </a>
                </li>
              )}
              {config.workingHours && (
                <li>
                  <Icon name="clock" /> {config.workingHours}
                </li>
              )}
            </ul>
          ) : (
            <p>
              Зв’яжіться з нами через <Link href="/#request">форму заявки</Link>.
            </p>
          )}
        </div>

        <div className="site-footer__legal">
          <Link href="/privacy">{content.footer.privacy}</Link>
          <Link href="/umovy">{content.footer.terms}</Link>
          <small>© {year} ЗалікОк</small>
        </div>
      </div>
    </footer>
  );
}
