"""
Одноразове вилучення текстів зі збережених сторінок старого сайту власника.
Використання: python scripts/extract-old-site.py <папка_зі_сторінками> <вихідна_папка>
Створює <вихідна_папка>/<index>.json зі структурою секцій (заголовки, абзаци, списки, таблиці, FAQ).
"""
import json
import os
import re
import sys

from bs4 import BeautifulSoup, NavigableString, Tag

SKIP_TAGS = {'script', 'style', 'svg', 'noscript', 'form', 'button', 'input', 'iframe', 'select', 'textarea', 'img', 'picture'}
BLOCK_TAGS = ['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'table', 'details', 'blockquote']


def esc(s: str) -> str:
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def inline(node: Tag) -> str:
    out = []
    for c in node.children:
        if isinstance(c, NavigableString):
            out.append(esc(str(c)))
        elif isinstance(c, Tag):
            if c.name in SKIP_TAGS:
                continue
            if c.name == 'a':
                href = (c.get('href') or '').replace('"', '&quot;')
                out.append(f'<a href="{href}">{inline(c)}</a>')
            elif c.name in ('strong', 'b'):
                out.append(f'<strong>{inline(c)}</strong>')
            elif c.name in ('em', 'i'):
                out.append(f'<em>{inline(c)}</em>')
            elif c.name == 'br':
                out.append('<br>')
            else:
                out.append(inline(c))
    return re.sub(r'\s+', ' ', ''.join(out)).strip()


def walk(node: Tag, out: list):
    for c in node.children:
        if not isinstance(c, Tag) or c.name in SKIP_TAGS:
            continue
        n = c.name
        if re.fullmatch(r'h[1-4]', n):
            x = inline(c)
            if x:
                out.append({'t': n, 'html': x})
        elif n == 'p':
            x = inline(c)
            if x:
                out.append({'t': 'p', 'html': x})
        elif n in ('ul', 'ol'):
            items = [inline(li) for li in c.find_all('li', recursive=False)]
            items = [i for i in items if i]
            if items:
                out.append({'t': n, 'items': items})
        elif n == 'table':
            rows = [[inline(td) for td in tr.find_all(['td', 'th'], recursive=False)] for tr in c.find_all('tr')]
            out.append({'t': 'table', 'rows': rows})
        elif n == 'details':
            s = c.find('summary')
            q = inline(s) if s else ''
            if s:
                s.extract()
            body: list = []
            walk(c, body)
            if not body:
                x = inline(c)
                if x:
                    body.append({'t': 'p', 'html': x})
            out.append({'t': 'faq', 'q': q, 'a': body})
        elif n == 'blockquote':
            out.append({'t': 'quote', 'html': inline(c)})
        elif n == 'a' and re.search(r'btn|button', ' '.join(c.get('class') or [])):
            out.append({'t': 'cta', 'html': inline(c), 'href': c.get('href') or ''})
        else:
            if c.find(BLOCK_TAGS):
                walk(c, out)
            else:
                x = inline(c)
                if len(x) > 1:
                    out.append({'t': 'p', 'html': x, 'cls': ' '.join(c.get('class') or [])[:30]})


def extract(path: str) -> dict:
    soup = BeautifulSoup(open(path, encoding='utf8', errors='replace').read(), 'lxml')
    desc = soup.find('meta', attrs={'name': 'description'})
    main = soup.find('main') or soup.body
    sections = []
    for s in main.find_all('section'):
        if s.find_parent('section'):
            continue
        blocks: list = []
        walk(s, blocks)
        sections.append({'id': s.get('id') or '', 'cls': ' '.join(s.get('class') or [])[:40], 'blocks': blocks})
    hero = soup.select_one('header.hero')
    hero_text = []
    if hero:
        seen = set()
        for e in hero.select('h1,p,li,span,a,strong'):
            t = re.sub(r'\s+', ' ', e.get_text(' ', strip=True))
            if t and t not in seen:
                seen.add(t)
                hero_text.append(t)
    h1 = soup.find('h1')
    return {
        'file': os.path.basename(path),
        'title': (soup.title.string or '').strip() if soup.title else '',
        'description': desc.get('content', '') if desc else '',
        'h1': re.sub(r'\s+', ' ', h1.get_text(' ', strip=True)) if h1 else '',
        'hero': hero_text,
        'sections': sections,
    }


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(('.html', '.htm')))
    for i, f in enumerate(files, 1):
        data = extract(os.path.join(src, f))
        json.dump(data, open(os.path.join(dst, f'{i:02d}.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
        print(f'{i:02d}', data['h1'][:50], '| sections:', len(data['sections']))
