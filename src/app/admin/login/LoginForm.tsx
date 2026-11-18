'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    // Логін без «@» (наприклад, admin) відповідає службовій адресі admin@admin.local
    const login = String(data.get('email') ?? '').trim();
    const { error: err } = await authClient.signIn.email({
      email: login.includes('@') ? login : `${login}@admin.local`,
      password: String(data.get('password') ?? ''),
      rememberMe: data.get('remember') === 'on',
    });
    setBusy(false);
    if (err) {
      setError(err.status === 429 ? 'Забагато спроб входу. Спробуйте за кілька хвилин.' : 'Невірна пошта або пароль.');
      return;
    }
    router.replace('/admin');
    router.refresh();
  }

  return (
    <form method="post" action="/admin/login" onSubmit={onSubmit} className="admin-login__form" aria-busy={busy}>
      <div className="field">
        <label htmlFor="email">Логін або e-mail</label>
        <input id="email" name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </div>
      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <label className="check">
        <input type="checkbox" name="remember" defaultChecked />
        <span>Запам’ятати мене на цьому пристрої</span>
      </label>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Вхід…' : 'Увійти'}
      </button>
    </form>
  );
}
