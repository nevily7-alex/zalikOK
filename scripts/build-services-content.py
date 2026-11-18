"""
Збирає контент розділу «Послуги» з файлів старого сайту власника (одноразово).
Використання: python scripts/build-services-content.py <папка_зі_збереженими_сторінками>
Результат: content/services/*.json, content/services/index.json, docs/services-import-report.md

Що робить:
- нормалізує обидва шаблони старих сторінок (новий із секціями та старий із блоками serv-info/asks/servis-more);
- не переносить блоки: «Отримати консультацію», «Як виконуємо замовлення…», «Хто пишуть/Хто пише…», «Відгуки…»,
  а також службові (форма, коментарі, інші послуги);
- замінює бренд на «ЗалікОк», прибирає посилання на старий сайт;
- не переносить фрагменти, що суперечать новим Умовам або містять старі ціни: ціни в грн, відсотки (крім 50/50),
  уникальність/антиплагіат/ШІ-перевірки, обіцянки строків відповіді, ФОП, особистий кабінет, повернення коштів,
  історію бренду («з 2010 року», кількість авторів/робіт/відгуків);
- усе вилучене фіксується у звіті.
"""
import importlib.util
import json
import os
import re
import sys
from collections import defaultdict

from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('old_extract', os.path.join(HERE, 'extract-old-site.py'))
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'content', 'services')
REPORT = os.path.join(ROOT, 'docs', 'services-import-report.md')

# Ключові слова в назві файлу → (slug, назва, id у прайсі або None)
SERVICES = [
    ('курсов', 'kursovi-roboty', 'Курсові роботи', 'kursova'),
    ('дипломну роботу', 'dyplomni-roboty', 'Дипломні роботи', 'dyplomna'),
    ('магістерську', 'magisterski-roboty', 'Магістерські роботи', 'magisterska'),
    ('реферату', 'referaty', 'Реферати', 'referat'),
    ('контрольних', 'kontrolni-roboty', 'Контрольні роботи', 'kontrolna'),
    ('звіт', 'zvity-z-praktyky', 'Звіти з практики', 'zvit-praktyka'),
    ('практичних', 'praktychni-roboty', 'Практичні роботи', 'praktychna'),
    ('домашніх', 'domashni-zavdannia', 'Домашні завдання', 'domashnie'),
    ('доповіді', 'dopovidi-do-zakhystu', 'Доповіді до захисту', 'dopovid'),
    ('презентацію', 'prezentatsii', 'Презентації', 'prezentatsiya'),
    ('авторефератів', 'avtoreferaty', 'Автореферати', 'avtoreferat'),
    ('дисертації на замовлення', 'dysertatsii', 'Дисертації', 'dysertatsiya'),
    ('статті до дисертації', 'statti-do-dysertatsii', 'Статті до дисертації', 'stattya'),
    ('переклад', 'pereklad-tekstiv', 'Переклад текстів', 'pereklad'),
    ('мотиваційного', 'motyvatsiinyi-lyst', 'Мотиваційний лист', 'motyvatsiynyi-lyst'),
    ('пояснювальної', 'poiasniuvalna-zapyska', 'Пояснювальна записка', None),
    ('диплому mba', 'dyplom-mba', 'Диплом MBA', None),
    ('орфографії', 'perevirka-orfohrafii', 'Перевірка орфографії', 'perevirka-tekstu'),
]
SKIP_FILE_WORDS = ['іспит', 'ціни на студентські']  # онлайн-допомога на іспитах не переноситься; прайс-огляд — окрема сторінка

EXCLUDED_HEADINGS = re.compile(
    r'консультац|як виконуємо|дата кожного етапу|хто пише|хто пишуть|хто пише вашу|відгук|чим автор відрізняється|'
    r'chatgpt|по містах|у містах|гаранті|правки і|як відбувається оплата|варіанти оплати|що ми гарантуємо|терміни та вартість',
    re.I,
)

RISKY = [
    ('ціна в грн (стара)', re.compile(r'грн|₴|гривн', re.I)),
    ('відсотки (крім 50/50)', None),  # спеціальна перевірка
    ('уникальність/антиплагіат/ШІ', re.compile(r'унікальн|антиплагіат|\bШІ\b|\bІІ\b|\bAI\b|штучн\w+ інтелект|chatgpt|turnitin|нейромереж', re.I)),
    ('обіцянка строку відповіді', re.compile(r'протягом (кількох )?(години|годин)|за годину|до години|цілодобов|протягом доби|2 хв\b', re.I)),
    ('ФОП/кабінет/бот', re.compile(r'\bФОП\b|особист\w+ кабінет|telegram-бот|у боті|договір за бажанням', re.I)),
    ('обіцянки, що суперечать Умовам (правки/гарантії/оплата/план безкоштовно)', re.compile(r'безкоштовн|безстрок|без обмеження терміну|гаранту|гарантія|гарантії|гарантован|передоплат|готівк|в офісі|єдина компанія|поетапн\w+ (здач|оплат)|оплачуєте за фактом|по всій україні|три варіанти|3 варіанти|за 2 хвилини|до 2 хвилин|без дзвінків|без прихованих|ніяких доплат|реальн\w+ авторів|реальних гарантій|системою? контролю якості|власну внутрішню|оплат\w+ частинами|зобов.язань', re.I)),
    ('повернення коштів', re.compile(r'поверн\w+ (коштів|грошей)|повернемо (кошти|гроші)|гарант\w+ поверненн', re.I)),
    ('історія/статистика бренду', re.compile(r'з 20\d\d року|\d[\d\s]*\+?\s*(авторів|робіт|відгуків|клієнтів)|понад \d[\d\s]*\s*(авторів|робіт|відгуків)', re.I)),
]
GENERIC_PRICE_ANSWER = (
    'Вартість залежить від виду роботи, обсягу, складності теми та строків. Орієнтовну ціну можна розрахувати '
    'в калькуляторі на цій сторінці, а остаточну вартість менеджер погоджує до початку роботи.'
)

removed = defaultdict(list)  # slug -> [(reason, snippet)]


def plain(html: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html)).strip()


def percent_risky(text: str) -> bool:
    vals = re.findall(r'(\d+)\s*%', text)
    return any(v != '50' for v in vals)


def risk_reason(text: str):
    for name, rx in RISKY:
        if name.startswith('відсотки'):
            if percent_risky(text):
                return name
        elif rx.search(text):
            return name
    return None


def brand(html: str) -> str:
    html = re.sub(r'D[ie]p\s?[Ss]ervi[sc]e?\b', 'ЗалікОк', html)
    html = re.sub(r'dipservis\.com\.ua', 'zalikok', html, flags=re.I)
    return html


def strip_links(html: str) -> str:
    return re.sub(r'</?a\b[^>]*>', '', html)


def clean(html: str) -> str:
    return strip_links(brand(html))


def filter_blocks(slug: str, blocks: list) -> list:
    """Прибирає ризиковані блоки, нормалізує, видаляє заголовки без вмісту."""
    out = []
    for b in blocks:
        t = b['t']
        if t in ('p', 'quote'):
            h = clean(b['html'])
            text = plain(h)
            if len(text) < 2:
                continue
            reason = risk_reason(text)
            if reason:
                removed[slug].append((reason, text[:110]))
                continue
            out.append({'t': 'p', 'html': h})
        elif t in ('ul', 'ol'):
            items = []
            for it in b['items']:
                h = clean(it)
                text = plain(h)
                reason = risk_reason(text)
                if reason:
                    removed[slug].append((reason, text[:110]))
                    continue
                items.append(h)
            if items:
                out.append({'t': t, 'items': items})
        elif t == 'table':
            head = plain(' '.join(b['rows'][0])) if b['rows'] else ''
            if re.search(r'Ціна|Замовити|Дія', head + ' ' + plain(' '.join(' '.join(r) for r in b['rows']))):
                removed[slug].append(('таблиця з цінами/кнопками замовлення', head[:110]))
                continue
            rows = []
            for r in b['rows']:
                cells = [clean(c) for c in r]
                text = plain(' '.join(cells))
                reason = risk_reason(text)
                if reason:
                    removed[slug].append((reason + ' (рядок таблиці)', text[:110]))
                    continue
                rows.append(cells)
            if len(rows) >= 2:
                out.append({'t': 'table', 'rows': rows})
            elif rows:
                removed[slug].append(('таблиця майже порожня після очищення', plain(' '.join(rows[0]))[:110]))
        elif t in ('h2', 'h3', 'h4', 'h1'):
            h = plain(clean(b['html']))
            if EXCLUDED_HEADINGS.search(h):
                out.append({'t': 'EXCLUDE_UNTIL_NEXT_H', 'level': int(t[1])})
                removed[slug].append(('виключений блок за заголовком', h[:110]))
                continue
            reason = risk_reason(h)
            if reason:
                out.append({'t': 'EXCLUDE_UNTIL_NEXT_H', 'level': int(t[1])})
                removed[slug].append((reason + ' (заголовок)', h[:110]))
                continue
            out.append({'t': t, 'html': h})
        # cta, faq тощо обробляються окремо
    # Обробка маркерів виключення
    final = []
    skip_level = None
    for b in out:
        if b['t'] == 'EXCLUDE_UNTIL_NEXT_H':
            skip_level = b['level']
            continue
        if b['t'] in ('h2', 'h3', 'h4') and skip_level is not None and int(b['t'][1]) <= skip_level:
            skip_level = None
        if skip_level is not None and b['t'] not in ('h2', 'h3', 'h4'):
            # зміст виключеного підрозділу
            txt = plain(b.get('html', '') or ' '.join(b.get('items', [])))
            removed[slug].append(('зміст виключеного підрозділу', txt[:110]))
            continue
        if skip_level is not None:
            removed[slug].append(('вкладений заголовок виключеного підрозділу', plain(b['html'])[:110]))
            continue
        final.append(b)
    # Заголовки без вмісту
    result = []
    for i, b in enumerate(final):
        if b['t'] in ('h2', 'h3', 'h4'):
            nxt = final[i + 1] if i + 1 < len(final) else None
            if nxt is None or nxt['t'] in ('h2', 'h3', 'h4') and int(nxt['t'][1]) <= int(b['t'][1]):
                removed[slug].append(('порожній розділ після очищення', b['html'][:110]))
                continue
        result.append(b)
    return result


def normalize_article_headings(blocks: list) -> list:
    """Перший заголовок — h2 (назва статті), решта — h3."""
    first = True
    out = []
    for b in blocks:
        if b['t'] in ('h1', 'h2', 'h3', 'h4'):
            out.append({'t': 'h2' if first else 'h3', 'html': b['html']})
            first = False
        else:
            out.append(b)
    return out


def faq_item(slug: str, q: str, answer_blocks: list):
    q = plain(clean(q))
    if re.search(r'хто пише|хто пишуть|повернете|поверн\w+ кош|договір|відгук', q, re.I):
        removed[slug].append(('FAQ-питання виключено (хто пише / повернення / договір / відгуки)', q[:110]))
        return None
    atext = plain(' '.join((x.get('html') or ' '.join(x.get('items', []))) for x in answer_blocks))
    if risk_reason(q) and not re.search(r'скільки коштує|вартість|ціна', q, re.I):
        removed[slug].append(('FAQ-питання виключено: ' + risk_reason(q), q[:110]))
        return None
    if re.search(r'скільки коштує|вартість|ціна|за скільки', q, re.I) or re.search(r'грн', atext):
        if re.search(r'скільки коштує|вартість|ціна|за скільки', q, re.I):
            removed[slug].append(('відповідь про ціну замінено на загальну', atext[:110]))
            return {'q': q, 'a': [{'t': 'p', 'html': GENERIC_PRICE_ANSWER}]}
    blocks = filter_blocks(slug, [{'t': 'p', 'html': x['html']} if x['t'] == 'p' else x for x in answer_blocks])
    if not blocks:
        removed[slug].append(('FAQ-відповідь порожня після очищення; питання виключено', q[:110]))
        return None
    return {'q': q, 'a': blocks}


def subject_names(soup) -> list:
    """Лише назви предметів (без цін). Старий шаблон має там список міст — він не переноситься."""
    names = []
    for b in soup.select('a.sj b'):
        t = b.get_text(' ', strip=True)
        if t and t not in names:
            names.append(t)
    return names


def build_one(path: str, slug: str, title: str, price_id):
    soup = BeautifulSoup(open(path, encoding='utf8', errors='replace').read(), 'lxml')
    data = old.extract(path)
    h1 = clean(data['h1'])
    page = {
        'slug': slug,
        'title': title,
        'priceId': price_id,
        'h1': h1,
        'tagline': None,
        'terms': None,
        'facts': [],
        'tiers': [],
        'faqTitle': 'Поширені запитання',
        'faq': [],
        'articleTitle': None,
        'article': [],
        'subjectsTitle': None,
        'subjectsLead': None,
        'subjects': [],
        'ctaTitle': None,
    }
    secs = data['sections']
    if secs:  # новий шаблон (курсова, дипломна)
        article = max(secs, key=lambda s: len(s['blocks']) if not any(b['t'] == 'faq' for b in s['blocks']) and s['id'] != 'reviews' else -1)
        for s in secs:
            heads = [plain(b['html']) for b in s['blocks'] if b['t'] in ('h2', 'h3')]
            first = heads[0] if heads else ''
            if s['id'] == 'terms':
                # лишаємо лише блок «Одні й ті самі умови…» (без макета замовлення з цінами й унікальністю)
                idx = next((i for i, b in enumerate(s['blocks']) if b['t'] == 'h2'), None)
                if idx is not None:
                    page['terms'] = filter_blocks(slug, s['blocks'][idx:])
                removed[slug].append(('макет замовлення «Ваша …» (ціна, унікальність, антиплагіат)', first[:110]))
            elif s['id'] == 'prices':
                tiers = []
                bl = s['blocks']
                i = 0
                while i < len(bl):
                    if bl[i]['t'] == 'h3' and not EXCLUDED_HEADINGS.search(plain(bl[i]['html'])) and 'графік' not in plain(bl[i]['html']).lower():
                        name = plain(bl[i]['html'])
                        desc = plain(bl[i + 1]['html']) if i + 1 < len(bl) and bl[i + 1]['t'] == 'p' else ''
                        pages = plain(bl[i + 2]['html']) if i + 2 < len(bl) and bl[i + 2]['t'] == 'p' and re.search(r'сторін|с\.', bl[i + 2]['html']) else ''
                        if not risk_reason(desc):
                            tiers.append({'name': name, 'desc': desc, 'pages': pages})
                        else:
                            removed[slug].append(('опис тарифу прибрано: ' + risk_reason(desc), desc[:110]))
                        i += 2
                    i += 1
                page['tiers'] = tiers
                removed[slug].append(('блок цін старого сайту замінено на ціни нового (калькулятор і прайс)', first[:110]))
            elif s['id'] == 'how' or s['id'] == 'reviews':
                removed[slug].append(('виключений блок', first[:110] or s['id']))
            elif 'faqsec' in s['cls']:
                h2s = [plain(b['html']) for b in s['blocks'] if b['t'] == 'h2']
                if h2s:
                    page['faqTitle'] = h2s[-1] if len(h2s) > 1 else h2s[0]
                for b in s['blocks']:
                    if b['t'] == 'faq':
                        it = faq_item(slug, b['q'], b['a'])
                        if it:
                            page['faq'].append(it)
                    elif b['t'] == 'cta' or (b['t'] == 'p' and re.search(r'Не знайшли відповідь|Напишіть нам', plain(b['html']))):
                        removed[slug].append(('блок «Не знайшли відповідь?»', plain(b.get('html', ''))[:110]))
            elif s is article:
                blocks = normalize_article_headings(filter_blocks(slug, s['blocks']))
                if blocks and blocks[0]['t'] == 'h2':
                    page['articleTitle'] = blocks[0]['html']
                    blocks = blocks[1:]
                page['article'] = blocks
            elif re.search(r'предмета', first):
                page['subjectsTitle'] = first
                lead = [plain(b['html']) for b in s['blocks'] if b['t'] == 'p' and not re.search(r'грн', b['html'])]
                page['subjectsLead'] = None
            elif re.search(r'Останні виконані', first):
                removed[slug].append(('старий список виконаних робіт замінено на блок з нашими даними', first[:110]))
            elif first.startswith('Дізнайтеся'):
                page['ctaTitle'] = re.sub(r'\s+', ' ', first)
            elif not heads:
                for b in s['blocks']:
                    removed[slug].append(('службовий блок без заголовка (гарантії/автори/статистика)', plain(b.get('html', '') or ' '.join(b.get('items', [])))[:110]))
            elif EXCLUDED_HEADINGS.search(first):
                removed[slug].append(('виключений блок', first[:110]))
            else:
                # додаткові змістові секції (напр. «Як виглядає результат…»): пропускаємо через фільтр і додаємо до статті
                extra = normalize_article_headings(filter_blocks(slug, s['blocks']))
                extra = [({'t': 'h3', 'html': b['html']} if b['t'] == 'h2' else b) for b in extra]
                page['article'] = page['article'] + extra
        # підказка hero (tagline): без обіцянок, що суперечать Умовам
        for line in data['hero'][1:3]:
            if len(line) > 40 and not risk_reason(line):
                page['tagline'] = clean(line)
                break
            elif len(line) > 40:
                removed[slug].append(('підзаголовок hero прибрано: ' + risk_reason(line), line[:110]))
    else:  # старий шаблон
        main = soup.find('main')
        art = main.select_one('div.servis-more')
        if art:
            blocks = [b for b in _walk(art) if b['t'] != 'cta']
            blocks = normalize_article_headings(filter_blocks(slug, blocks))
            if blocks and blocks[0]['t'] == 'h2':
                page['articleTitle'] = blocks[0]['html']
                blocks = blocks[1:]
            page['article'] = blocks
        for li in main.select('ul.faq-data li'):
            sp = li.find('span')
            ans = plain(old.inline(sp)) if sp else ''
            if sp:
                sp.extract()
            q = li.get_text(' ', strip=True)
            it = faq_item(slug, q, [{'t': 'p', 'html': old.inline(sp) if sp else ans}] if ans else [])
            if it:
                page['faq'].append(it)
        for li in main.select('ul.serv-info li'):
            removed[slug].append(('старі гарантії/ціна/термін (serv-info)', re.sub(r'\s+', ' ', li.get_text(' ', strip=True))[:110]))
        if main.select_one('table.table-markup'):
            removed[slug].append(('таблиця «Основна інформація» (стара ціна, термін, гарантії)', ''))
        if main.select_one('div.how-work'):
            removed[slug].append(('виключений блок «Як працюємо»', ''))
        if main.select_one('div.responses'):
            removed[slug].append(('виключений блок відгуків', ''))
    page['subjects'] = subject_names(soup)
    return page


def _walk(node):
    out = []
    old.walk(node, out)
    return out


def main():
    src = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(('.html', '.htm')))
    index = []
    pages = {}
    used = set()
    for f in files:
        low = f.lower()
        if any(w in low for w in SKIP_FILE_WORDS):
            print('пропущено:', f[:60])
            continue
        # обираємо послугу, ключове слово якої стоїть у назві файлу найраніше
        cands = [(low.index(s[0]), s) for s in SERVICES if s[0] in low]
        match = min(cands, key=lambda c: c[0])[1] if cands else None
        if not match:
            print('?? не розпізнано:', f[:70])
            continue
        _, slug, title, price_id = match
        used.add(slug)
        page = build_one(os.path.join(src, f), slug, title, price_id)
        pages[slug] = page
        index.append({'slug': slug, 'title': title, 'priceId': price_id})
        print(f'{slug:26} article={len(page["article"]):3} faq={len(page["faq"]):2} subjects={len(page["subjects"]):3} tiers={len(page["tiers"])}')
    order = [s[1] for s in SERVICES]
    json.dump([pages[o] for o in order if o in pages], open(os.path.join(OUT, 'pages.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    index.sort(key=lambda x: order.index(x['slug']))
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=1)

    lines = ['# Звіт імпорту розділу «Послуги»', '',
             'Автоматично згенеровано `scripts/build-services-content.py`. Нижче — що НЕ перенесено зі старого сайту і чому.',
             'Це можна додати вручну в `content/services/pages.json`, якщо власник підтвердить, що фрагмент відповідає новим Умовам.', '']
    total = 0
    for slug in order:
        if slug not in removed:
            continue
        lines += [f'## {slug}', '']
        by = defaultdict(list)
        for reason, snip in removed[slug]:
            by[reason].append(snip)
        for reason, snips in sorted(by.items(), key=lambda kv: -len(kv[1])):
            lines.append(f'- **{reason}**: {len(snips)}')
            for s in snips[:3]:
                if s:
                    lines.append(f'  - «{s}»')
            total += len(snips)
        lines.append('')
    lines.insert(3, f'Усього вилучено фрагментів: **{total}**.')
    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    open(REPORT, 'w', encoding='utf8').write('\n'.join(lines))
    print('вилучено фрагментів:', total)


if __name__ == '__main__':
    main()
