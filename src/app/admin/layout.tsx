import type { Metadata } from 'next';
import '@/styles/admin.css';

export const metadata: Metadata = {
  title: 'Панель менеджера — ЗалікОк',
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin">{children}</div>;
}
