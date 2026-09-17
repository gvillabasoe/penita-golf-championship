'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { updateRules } from '@/lib/actions/admin';

export function RulesForm({
  allowancePercent,
  ruleVersion,
  divergenceCount,
  competitionInPlay,
}: {
  allowancePercent: number;
  ruleVersion: string;
  divergenceCount: number;
  competitionInPlay: boolean;
}) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(allowancePercent));
  const [policy, setPolicy] = useState<'ROUND_ONCE' | 'ROUND_TWICE'>(
    ruleVersion.includes('ROUND_ONCE') ? 'ROUND_ONCE' : 'ROUND_TWICE',
  );
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    const result = await updateRules(Number(percent), policy, reason);
    setBusy(false);
    setFeedback(
      result.ok
        ? { ok: true, text: result.message ?? 'Reglas actualizadas.' }
        : { ok: false, text: result.error },
    );
    if (result.ok) router.refresh();
  }

  return (
    <section className="card stack" aria-label="Reglas de calculo">
      <h2>Reglas de calculo</h2>

      <p className="muted">
        Las dos politicas de redondeo difieren en {divergenceCount} de los 401 hándicaps entre 0,0
        y 40,0, siempre por un golpe. ROUND_TWICE es la lectura literal del WHS y es lo que
        calcula cualquier calculadora externa.
      </p>

      <div className="field">
        <label htmlFor="allowance">Porcentaje de asignacion</label>
        <input
          id="allowance"
          type="number"
          min={1}
          max={100}
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="policy">Politica de redondeo</label>
        <select
          id="policy"
          value={policy}
          onChange={(event) => setPolicy(event.target.value as 'ROUND_ONCE' | 'ROUND_TWICE')}
        >
          <option value="ROUND_TWICE">ROUND_TWICE (WHS literal)</option>
          <option value="ROUND_ONCE">ROUND_ONCE (pliego original)</option>
        </select>
      </div>

      {competitionInPlay ? (
        <div className="field">
          <label htmlFor="reason">Motivo (obligatorio con la vuelta empezada)</label>
          <textarea
            id="reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      ) : null}

      <button type="button" className="button button--primary" disabled={busy} onClick={save}>
        {busy ? 'Recalculando...' : 'Guardar y recalcular'}
      </button>

      {feedback ? (
        <p className={feedback.ok ? 'muted' : 'alert'} role={feedback.ok ? 'status' : 'alert'}>
          {feedback.text}
        </p>
      ) : null}
    </section>
  );
}
