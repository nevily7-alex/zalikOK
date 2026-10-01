import { Hero } from '@/components/Hero';
import { Services } from '@/components/Services';
import { Pricing } from '@/components/Pricing';
import { Process } from '@/components/Process';
import { Samples } from '@/components/Samples';
import { RequestSection } from '@/components/RequestSection';
import { Faq } from '@/components/Faq';
import { SectionTitle } from '@/components/SectionTitle';
import { content } from '@/lib/content';

// Рік у футері оновлюється щодоби
export const revalidate = 86400;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: content.faq.items.map((i) => ({
    '@type': 'Question',
    name: i.question,
    acceptedAnswer: { '@type': 'Answer', text: i.answer },
  })),
};

export default function HomePage() {
  return (
    <>
      {/* FAQ-розмітка збігається з видимим вмістом секції; без обіцянок rich result */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, '\\u003c') }}
      />
      <Hero />
      <Services />
      <Pricing />
      <Process />
      <Samples title={content.samples.title} items={content.samples.items} cta={content.samples.cta} />
      <RequestSection />
      <section id="faq" className="section container" aria-labelledby="faq-title">
        <SectionTitle id="faq-title">{content.faq.title}</SectionTitle>
        <Faq items={content.faq.items} />
      </section>
    </>
  );
}
