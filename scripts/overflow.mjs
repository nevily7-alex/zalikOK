import { chromium } from '@playwright/test';
const [, , w = '640', path = '/'] = process.argv;
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: Number(w), height: 450 } });
await p.goto('http://localhost:3100' + path, { waitUntil: 'networkidle' });
const r = await p.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  return [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > vw + 0.5).slice(0, 8).map((e) => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right));
});
console.log(r);
await b.close();
