/**
 * Version de la aplicacion, disponible en tiempo de ejecucion.
 *
 * Existe por una confusion concreta: el diagnostico decia que todo estaba bien
 * y no habia forma de saber que version del codigo estaba respondiendo. Se
 * deduce mirando que campos trae la respuesta, que es una forma absurda de
 * averiguarlo.
 *
 * No se importa `package.json` a proposito: meter un JSON de fuera de `src` en
 * el empaquetado de Next funciona, pero depende del rastreo de archivos y es
 * una dependencia fragil para un dato de siete caracteres. Un constante y un
 * test que comprueba que no se desincroniza es mas robusto.
 */
export const APP_VERSION = '1.2.0';
