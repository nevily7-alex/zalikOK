// Знімки екранів для перевірки: node scripts/shot.mjs <url-path> <width> <out> [fullPage]
import { chromium } from '@playwright/test';
const [, , path = '/', width = '1440', out = 'screenshots/home-1440.png', full = 'true'] = process.argv;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:3100/' + path.replace(/^\/+/, ''), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: full === 'true' });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(JSON.stringify({ out, overflow, errors }));
await browser.close();
