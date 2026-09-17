import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/server';

export default async function HomePage() {
  await requireSession('/');
  redirect('/tarjeta');
}
