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
    const { error: err } = await authClient.signIn.email({
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
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
    <form onSubmit={onSubmit} className="admin-login__form" aria-busy={busy}>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
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
