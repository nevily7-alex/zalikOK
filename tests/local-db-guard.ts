/**
 * Тести створюють і видаляють дані, тому працюють лише з локальною БД.
 * Щоб навмисно запустити проти іншої БД: ALLOW_REMOTE_DB_TESTS=1 (на власний ризик).
 */
export function assertLocalDatabase(url = process.env.DATABASE_URL): void {
  if (process.env.ALLOW_REMOTE_DB_TESTS === '1') return;
  let host = '';
  try {
    host = new URL(url ?? '').hostname;
  } catch {
    /* порожній або некоректний URL */
  }
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(
      `Тести заблоковано: DATABASE_URL вказує на «${host || 'невідомо'}», а не на локальну БД. ` +
        'Поверніть локальну БД (.env.backup) або задайте ALLOW_REMOTE_DB_TESTS=1.',
    );
  }
}
