const ITEMS = [
  'Ціна до початку роботи',
  'Три безкоштовні звернення з правками',
  'Оплата 50/50 або 100%',
  'Єдині умови для кожної роботи',
];

/** Бігучий рядок з умовами: лише те, що закріплено в Умовах. Другий примірник схований від скрінрідерів. */
export function Ticker() {
  return (
    <div className="container home-ticker rv">
      <div className="svc-mq" aria-label="Умови співпраці">
        <div className="svc-mq__track">
          {[0, 1].map((k) => (
            <div className="svc-mq__grp" key={k} aria-hidden={k === 1 ? true : undefined}>
              {[...ITEMS, ...ITEMS].map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
