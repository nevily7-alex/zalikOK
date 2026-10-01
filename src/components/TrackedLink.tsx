'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { track, type AnalyticsEvent, type AnalyticsPayload } from '@/lib/analytics';

type Props = ComponentProps<typeof Link> & { event: AnalyticsEvent; payload?: AnalyticsPayload; external?: boolean };

/** Посилання з подією аналітики (payload без персональних даних). */
export function TrackedLink({ event, payload, external, onClick, ...rest }: Props) {
  const extra = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <Link
      {...rest}
      {...extra}
      onClick={(e) => {
        track(event, payload);
        onClick?.(e);
      }}
    />
  );
}
