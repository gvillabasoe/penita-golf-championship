'use client';

import { useMemo, useState } from 'react';

import { searchUsers, type SearchableUser } from '@/lib/auth/normalize';

/**
 * Selector buscable del login (seccion 13).
 *
 * La busqueda la resuelve `searchUsers`, que ignora mayusculas, tildes y trata
 * el guion como separador, y tiene sus tests. Aqui solo hay estado de interfaz.
 */
export function PlayerSelect({ players }: { players: SearchableUser[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('');

  const results = useMemo(() => searchUsers(players, query), [players, query]);

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="buscador">Busca tu nombre</label>
        <input
          id="buscador"
          type="text"
          autoComplete="off"
          inputMode="text"
          placeholder="Nombre o apellido"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <input type="hidden" name="userId" value={selected} />

      <ul className="player-list" aria-label="Participantes">
        {results.map((player) => (
          <li key={player.id}>
            <button
              type="button"
              className={`player-list__item${selected === player.id ? ' player-list__item--selected' : ''}`}
              aria-pressed={selected === player.id}
              onClick={() => setSelected(player.id)}
            >
              {player.displayName}
            </button>
          </li>
        ))}
        {results.length === 0 ? (
          <li className="muted">Ningun participante coincide con la busqueda.</li>
        ) : null}
      </ul>
    </div>
  );
}
