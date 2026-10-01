'use client';

import { useState } from 'react';
import { DatePicker } from './DatePicker';
import { Select, type SelectItem } from './Select';

/** Некеровані версії для звичайних HTML-форм (GET-фільтри, server actions): значення йде через hidden input з name. */
export function FormSelect({
  id,
  name,
  defaultValue = '',
  items,
  placeholder,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  items: SelectItem[];
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return <Select id={id} name={name} value={value} items={items} placeholder={placeholder} onChange={setValue} />;
}

export function FormDate({ id, name, defaultValue = '', placeholder }: { id: string; name: string; defaultValue?: string; placeholder?: string }) {
  const [value, setValue] = useState(defaultValue);
  return <DatePicker id={id} name={name} value={value} onChange={setValue} clearable placeholder={placeholder} />;
}
