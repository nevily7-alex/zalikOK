import type { SVGProps } from 'react';

export type IconName =
  | 'document' | 'edit' | 'format' | 'book' | 'calendar' | 'clock' | 'chat' | 'telegram' | 'check'
  | 'check-circle' | 'arrow-right' | 'arrow-left' | 'chevron-down' | 'chevron-up' | 'plus' | 'close'
  | 'upload' | 'paperclip' | 'email' | 'phone' | 'shield' | 'lock' | 'graduation' | 'calculator'
  | 'chart' | 'external' | 'download' | 'menu' | 'info' | 'warning' | 'presentation' | 'sparkles'
  | 'user' | 'search' | 'copy' | 'refresh';

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName | string;
  large?: boolean;
}

/** Лінійна іконка зі спрайта (currentColor успадковується). Декоративна: aria-hidden. */
export function Icon({ name, large, className, ...rest }: IconProps) {
  return (
    <svg
      className={['icon', large ? 'icon-lg' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <use href={`/assets/icons/sprite.svg#${name}`} />
    </svg>
  );
}
