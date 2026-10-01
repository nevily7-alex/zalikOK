import { redirect } from 'next/navigation';
import { getAccess } from '@/lib/server/guard';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const access = await getAccess();
  if (access.kind === 'ok') redirect('/admin');
  return (
    <main className="admin-login" id="main">
      <h1>Вхід для менеджера</h1>
      {access.kind === 'forbidden' && (
        <p className="form-alert" role="alert">
          Ваш обліковий запис не має доступу до панелі менеджера.
        </p>
      )}
      <LoginForm />
    </main>
  );
}
