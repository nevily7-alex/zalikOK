const B = 'http://localhost:3000';
const H = { Origin: B, 'Content-Type': 'application/json' };
const body = { service: 'plan', discipline: 'law', topic: 'Тема курсової про право', deadline: '2030-01-01', contactMethod: 'telegram', contact: '@zalik_test', privacyConsent: true, fileIds: [] };
const r1 = await fetch(B + '/api/requests', { method: 'POST', headers: { ...H, 'Idempotency-Key': 'smoke-key-' + Date.now() }, body: JSON.stringify(body) });
console.log(r1.status, await r1.text());
