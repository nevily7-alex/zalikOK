import type { Block } from '@/lib/services';

/** Рендер блоків імпортованого контенту. HTML у JSON — наш власний (лише strong/em/br), тож вставка безпечна. */
export function ServiceBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'p':
            return <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((x, j) => (
                  <li key={j} dangerouslySetInnerHTML={{ __html: x }} />
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((x, j) => (
                  <li key={j} dangerouslySetInnerHTML={{ __html: x }} />
                ))}
              </ol>
            );
          case 'h2':
            return <h2 key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
          case 'h3':
            return <h3 key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
          case 'h4':
            return <h4 key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
          case 'table':
            return (
              <div key={i} className="svc-table">
                <table>
                  <thead>
                    <tr>
                      {b.rows[0]!.map((c, j) => (
                        <th key={j} dangerouslySetInnerHTML={{ __html: c }} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.slice(1).map((r, k) => (
                      <tr key={k}>
                        {r.map((c, j) => (
                          <td key={j} dangerouslySetInnerHTML={{ __html: c }} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}
