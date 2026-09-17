# Divergencia entre políticas de redondeo

Campo: Ulzama, amarillas caballeros, Slope 139 / Vc 72,6 / Par 72. Asignación 95 %.
Generado por `scripts/generate-divergence-table.ts` a partir del motor, no a mano.

**125 de 541 hándicaps exactos** (0,0 – 54,0) reciben un hándicap de juego
distinto según la política. Agrupados en 55 tramos contiguos:

| Hándicap exacto | ROUND_ONCE | ROUND_TWICE | Diferencia |
|---|---|---|---|
| 1,6 | 2 | 3 | +1 golpe con WHS |
| 2,4 – 2,5 | 3 | 4 | +1 golpe con WHS |
| 3,2 – 3,3 | 4 | 5 | +1 golpe con WHS |
| 4,0 – 4,2 | 5 | 6 | +1 golpe con WHS |
| 4,8 – 5,0 | 6 | 7 | +1 golpe con WHS |
| 5,7 – 5,9 | 7 | 8 | +1 golpe con WHS |
| 6,5 – 6,7 | 8 | 9 | +1 golpe con WHS |
| 7,3 – 7,6 | 9 | 10 | +1 golpe con WHS |
| 8,5 – 8,8 | 11 | 10 | −1 golpe con WHS |
| 9,4 – 9,6 | 12 | 11 | −1 golpe con WHS |
| 10,3 – 10,4 | 13 | 12 | −1 golpe con WHS |
| 11,1 – 11,2 | 14 | 13 | −1 golpe con WHS |
| 12,0 – 12,1 | 15 | 14 | −1 golpe con WHS |
| 12,8 – 12,9 | 16 | 15 | −1 golpe con WHS |
| 13,7 | 17 | 16 | −1 golpe con WHS |
| 14,5 | 18 | 17 | −1 golpe con WHS |
| 17,0 | 20 | 21 | +1 golpe con WHS |
| 17,9 | 21 | 22 | +1 golpe con WHS |
| 18,7 | 22 | 23 | +1 golpe con WHS |
| 19,5 – 19,6 | 23 | 24 | +1 golpe con WHS |
| 20,3 – 20,4 | 24 | 25 | +1 golpe con WHS |
| 21,1 – 21,3 | 25 | 26 | +1 golpe con WHS |
| 21,9 – 22,1 | 26 | 27 | +1 golpe con WHS |
| 22,7 – 23,0 | 27 | 28 | +1 golpe con WHS |
| 23,5 – 23,9 | 28 | 29 | +1 golpe con WHS |
| 24,8 – 25,1 | 30 | 29 | −1 golpe con WHS |
| 25,7 – 25,9 | 31 | 30 | −1 golpe con WHS |
| 26,5 – 26,7 | 32 | 31 | −1 golpe con WHS |
| 27,4 – 27,5 | 33 | 32 | −1 golpe con WHS |
| 28,2 – 28,3 | 34 | 33 | −1 golpe con WHS |
| 29,1 | 35 | 34 | −1 golpe con WHS |
| 29,9 | 36 | 35 | −1 golpe con WHS |
| 30,8 | 37 | 36 | −1 golpe con WHS |
| 33,3 | 39 | 40 | +1 golpe con WHS |
| 34,1 | 40 | 41 | +1 golpe con WHS |
| 34,9 – 35,0 | 41 | 42 | +1 golpe con WHS |
| 35,7 – 35,8 | 42 | 43 | +1 golpe con WHS |
| 36,6 – 36,7 | 43 | 44 | +1 golpe con WHS |
| 37,4 – 37,5 | 44 | 45 | +1 golpe con WHS |
| 38,2 – 38,4 | 45 | 46 | +1 golpe con WHS |
| 39,0 – 39,3 | 46 | 47 | +1 golpe con WHS |
| 39,8 – 40,1 | 47 | 48 | +1 golpe con WHS |
| 41,1 – 41,3 | 49 | 48 | −1 golpe con WHS |
| 41,9 – 42,1 | 50 | 49 | −1 golpe con WHS |
| 42,8 – 43,0 | 51 | 50 | −1 golpe con WHS |
| 43,6 – 43,8 | 52 | 51 | −1 golpe con WHS |
| 44,5 – 44,6 | 53 | 52 | −1 golpe con WHS |
| 45,3 – 45,4 | 54 | 53 | −1 golpe con WHS |
| 46,2 | 55 | 54 | −1 golpe con WHS |
| 48,7 | 57 | 58 | +1 golpe con WHS |
| 50,4 | 59 | 60 | +1 golpe con WHS |
| 51,2 | 60 | 61 | +1 golpe con WHS |
| 52,0 – 52,1 | 61 | 62 | +1 golpe con WHS |
| 52,8 – 52,9 | 62 | 63 | +1 golpe con WHS |
| 53,6 – 53,8 | 63 | 64 | +1 golpe con WHS |

Siempre un solo golpe de diferencia. ROUND_TWICE (WHS literal) da 74 veces
un golpe más y 51 veces un golpe menos.
