import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuth } from './auth';

export const MANAGER_ROLES = ['manager', 'admin'];

export interface Manager {
  id: string;
  email: string;
  name: string;
  role: string;
}

export type Access = { kind: 'anonymous' } | { kind: 'forbidden' } | { kind: 'ok'; manager: Manager };

/** Серверна перевірка сесії й ролі. Викликається в кожній сторінці, дії та API панелі. */
export async function getAccess(): Promise<Access> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) return { kind: 'anonymous' };
  const u = session.user as { id: string; email: string; name: string; role?: string | null };
  if (!u.role || !MANAGER_ROLES.includes(u.role)) return { kind: 'forbidden' };
  return { kind: 'ok', manager: { id: u.id, email: u.email, name: u.name, role: u.role } };
}

/** Для сторінок/дій: без сесії або без ролі менеджера — на сторінку входу (без витоку даних). */
export async function requireManager(): Promise<Manager> {
  const a = await getAccess();
  // forbidden: сторінка логіну пояснює відсутність доступу
  if (a.kind !== 'ok') redirect('/admin/login');
  return a.manager;
}
