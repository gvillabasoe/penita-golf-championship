import { notFound } from 'next/navigation';

import { requireSession } from '@/lib/auth/server';
import { getCompetition, getScorecard } from '@/lib/data/queries';
import { HoleEditor } from '@/components/client/hole-editor';
import { canEditHole } from '@/lib/scorecard/session';

export default async function HolePage({ params }: { params: Promise<{ hoyo: string }> }) {
  const { hoyo } = await params;
  const holeNumber = Number(hoyo);
  if (!Number.isInteger(holeNumber) || holeNumber < 1 || holeNumber > 18) notFound();

  const user = await requireSession(`/tarjeta/${holeNumber}`);
  const context = await getCompetition();
  if (!context || !user.competitionPlayerId) notFound();

  const card = await getScorecard(context, user.competitionPlayerId);
  if (!card) notFound();

  const hole = context.snapshot.holes.find((h) => h.holeNumber === holeNumber);
  const result = card.results.find((r) => r.holeNumber === holeNumber);
  if (!hole || !result) notFound();

  const permission = canEditHole({
    status: card.status,
    role: user.role,
    isOwner: true,
    isHoleOverridden: card.overriddenHoles.includes(holeNumber),
    hasReview: card.reviewedAt !== null,
  });

  return (
    <main className="container stack">
      <HoleEditor
        hole={hole}
        strokesReceived={result.strokesReceived}
        current={
          result.isPickup ? 'PICKUP' : result.grossStrokes === null ? null : result.grossStrokes
        }
        baseVersion={card.version}
        canEdit={permission.canEdit}
        blockedReason={permission.reason}
        invalidatesReview={permission.invalidatesReview}
      />
    </main>
  );
}
