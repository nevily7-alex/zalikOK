import { RequestForm } from './RequestForm';
import { content } from '@/lib/content';

export function RequestSection() {
  return (
    <section id="request" className="section container request-section" aria-labelledby="request-title">
      <div className="request-section__intro">
        <h2 id="request-title">{content.form.title}</h2>
        <p className="section-lead">{content.form.description}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="request-section__decor" src="/assets/decor/dashed-flight.svg" alt="" width={200} height={70} loading="lazy" />
      </div>
      <div className="request-section__panel">
        <RequestForm />
      </div>
    </section>
  );
}
