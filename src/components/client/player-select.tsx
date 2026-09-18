'use client';

import { useMemo, useState } from 'react';

import { searchUsers, type SearchableUser } from '@/lib/auth/normalize';
import { FormField } from '@/components/ui';

/**
 * Selector buscable del login (seccion 13).
 *
 * La busqueda la resuelve `searchUsers`, que ignora mayusculas y tildes y trata
 * el guion como separador, y tiene sus tests. Aqui solo hay estado de interfaz.
 *
 * El jugador elegido se marca en verde relleno, no con un borde fino: es el dato
 * que mas equivocaciones causa —trece nombres y dos Gonzalos— y tiene que
 * quedar claro a un metro de distancia.
 */
export function PlayerSelect({ players }: { players: SearchableUser[] }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('');

  const results = useMemo(() => searchUsers(players, query), [players, query]);
  const selectedPlayer = players.find((player) => player.id === selected) ?? null;

  return (
    <div className="stack--tight">
      <FormField
        id="buscador"
        label="Busca tu nombre"
        help={
          selectedPlayer
            ? `Vas a entrar como ${selectedPlayer.displayName}.`
            : `${players.length} participantes. Escribe nombre o apellido.`
        }
      >
        <input
          id="buscador"
          type="text"
          autoComplete="off"
          inputMode="text"
          placeholder="Nombre o apellido"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </FormField>

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
