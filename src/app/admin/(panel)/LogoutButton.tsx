'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={async () => {
        await authClient.signOut();
        router.replace('/admin/login');
        router.refresh();
      }}
    >
      Вийти
    </button>
  );
}
