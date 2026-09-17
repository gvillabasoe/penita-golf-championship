'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { setScorecardLock } from '@/lib/actions/admin';

export function LockButton({ scorecardId, locked }: { scorecardId: string; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await setScorecardLock(scorecardId, !locked);
    setBusy(false);
    router.refresh();
  }

  return (
    <button type="button" className="button button--secondary" disabled={busy} onClick={toggle}>
      {locked ? 'Desbloquear' : 'Bloquear'}
    </button>
  );
}
