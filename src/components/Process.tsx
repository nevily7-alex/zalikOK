import { Icon } from './Icon';
import { SectionTitle } from './SectionTitle';
import { content } from '@/lib/content';

export function Process() {
  const { process } = content;
  return (
    <section id="process" className="section container" aria-labelledby="process-title">
      <SectionTitle id="process-title">{process.title}</SectionTitle>
      <ol className="steps">
        {process.steps.map((step, i) => (
          <li key={step.title} className="step">
            <div className="step__head">
              <span className="step__num" aria-hidden="true">
                {i + 1}
              </span>
              <Icon name={step.icon} className="step__icon" />
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
