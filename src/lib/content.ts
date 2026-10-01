import raw from '@content/site-content.json';

export type ServiceId = 'plan' | 'editing' | 'formatting' | 'research-support' | 'presentation';
export type Tone = 'yellow' | 'neutral';

export interface ServiceCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  tone: Tone;
}

export const content = raw as typeof raw & { services: { items: ServiceCard[] } };
export type SiteContent = typeof content;
