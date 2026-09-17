'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Keypad, ConfirmationSheet } from '@/components/keypad';
import { buildConfirmationSummary } from '@/lib/scorecard/session';
import { saveHole } from '@/lib/actions/scorecard';
import type { HoleSnapshot } from '@/lib/golf/types';

/** Identificador estable del dispositivo: distingue "yo" de "otro movil". */
function deviceId(): string {
  const key = 'pgc:clientId';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

export function HoleEditor({
  hole,
  strokesReceived,
  current,
  baseVersion,
  canEdit,
  blockedReason,
  invalidatesReview,
}: {
  hole: HoleSnapshot;
  strokesReceived: number;
  current: number | 'PICKUP' | null;
  baseVersion: number;
  canEdit: boolean;
  blockedReason: string | null;
  invalidatesReview: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | 'PICKUP' | null>(current);
  const [extraConfirmed, setExtraConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const summary =
    selected === null
      ? null
      : buildConfirmationSummary(hole, strokesReceived, {
          holeNumber: hole.holeNumber,
          grossStrokes: selected === 'PICKUP' ? null : selected,
          isPickup: selected === 'PICKUP',
        });

  async function confirm() {
    if (selected === null) return;
    setSaving(true);
    setError(null);

    const result = await saveHole({
      clientMutationId: crypto.randomUUID(),
      clientId: deviceId(),
      holeNumber: hole.holeNumber,
      grossStrokes: selected === 'PICKUP' ? null : selected,
      isPickup: selected === 'PICKUP',
      baseVersion,
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push('/tarjeta');
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Hoyo {hole.holeNumber}</h1>
          <p className="muted">
            Par {hole.par} · SI {hole.strokeIndex} · {hole.distance} m
          </p>
        </div>
        <a className="button button--secondary" href="/tarjeta">
          Volver
        </a>
      </header>

      {!online ? (
        <p className="alert" role="status">
          Sin conexion. Apunta el resultado igual: se envia solo al recuperar cobertura.
        </p>
      ) : null}

      {!canEdit ? (
        <p className="alert" role="alert">
          {blockedReason}
        </p>
      ) : (
        <>
          {invalidatesReview ? (
            <p className="alert" role="status">
              Tu tarjeta ya estaba revisada. Si cambias este hoyo habra que revisarla otra vez.
            </p>
          ) : null}

          <Keypad selected={selected} disabled={saving} onSelect={setSelected} />

          {summary ? (
            <ConfirmationSheet
              summary={summary}
              extraConfirmed={extraConfirmed}
              onToggleExtra={setExtraConfirmed}
              onConfirm={confirm}
              onCancel={() => setSelected(null)}
            />
          ) : (
            <p className="muted">Elige los golpes o marca raya.</p>
          )}
        </>
      )}

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
