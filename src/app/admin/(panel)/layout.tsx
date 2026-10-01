import Link from 'next/link';
import { getAccess } from '@/lib/server/guard';
import { redirect } from 'next/navigation';
import { LogoutButton } from './LogoutButton';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess();
  if (access.kind === 'anonymous') redirect('/admin/login');
  if (access.kind === 'forbidden') {
    return (
      <main className="admin-login" id="main">
        <h1>Доступ заборонено</h1>
        <p>Ваш обліковий запис не має ролі менеджера.</p>
        <LogoutButton />
      </main>
    );
  }
  return (
    <>
      <header className="admin-header">
        <Link href="/admin" className="admin-header__title">
          ЗалікОк · Заявки
        </Link>
        <span className="admin-header__user">{access.manager.email}</span>
        <LogoutButton />
      </header>
      <main id="main" className="admin-main">
        {children}
      </main>
    </>
  );
}
