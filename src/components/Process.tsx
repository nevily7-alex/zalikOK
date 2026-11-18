import { Art, type ArtName } from './ServiceArt';
import { SectionTitle } from './SectionTitle';
import { content } from '@/lib/content';

const STEP_ART: ArtName[] = ['docs', 'chat', 'pencil', 'laptop'];

export function Process() {
  const { process } = content;
  return (
    <section id="process" className="section container" aria-labelledby="process-title">
      <SectionTitle id="process-title">{process.title}</SectionTitle>
      <ol className="steps rv-stagger">
        {process.steps.map((step, i) => (
          <li key={step.title} className="step rv">
            <div className="step__head">
              <span className="step__num" aria-hidden="true">
                {i + 1}
              </span>
              <Art name={STEP_ART[i % STEP_ART.length]!} className="step__art" />
            </div>
            <h3>
              <span className="sr-only">Крок {i + 1}: </span>
              {step.title}
            </h3>
            <p>{step.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
