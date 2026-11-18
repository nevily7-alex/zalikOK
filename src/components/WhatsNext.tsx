import Link from 'next/link';

/** «Що буде далі»: лише те, що закріплено в Умовах (оплата 50/50 або 100%, три безкоштовні правки). Без обіцянок строків. */
const STEPS = [
  {
    title: 'Менеджер переглядає заявку',
    text: 'Після відправки менеджер переглядає вимоги й зв’язується з вами обраним способом, щоб уточнити деталі.',
  },
  {
    title: 'Погоджуємо ціну й строк',
    text: 'Підтверджуємо вартість у гривнях, строк і порядок оплати до початку роботи. Нічого не платите, поки не погодите ціну.',
  },
  {
    title: 'Оплата: 50/50 або 100%',
    text: '50% до початку й 50% після результату для ознайомлення (у файлі з водяним знаком), або 100% до початку.',
  },
  {
    title: 'Три безкоштовні правки',
    text: 'Для одного замовлення передбачено три безкоштовні звернення з правками щодо початкового погодженого завдання.',
  },
];

export function WhatsNext() {
  return (
    <section className="whats-next" aria-labelledby="whats-next-title">
      <h2 id="whats-next-title">Що буде далі</h2>
      <ol className="whats-next__list">
        {STEPS.map((s, i) => (
          <li key={s.title} className="whats-next__item">
            <span className="whats-next__num" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="field-hint">
        Повні правила — в{' '}
        <Link href="/umovy" target="_blank">
          Умовах замовлення
        </Link>
        .
      </p>
    </section>
  );
}
