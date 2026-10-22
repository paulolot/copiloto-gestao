/**
 * Rebuilds or refreshes the semantic index outside the bridge (e.g. a nightly run):
 *   npm run indexar                          incremental
 *   npm run indexar -- --total               rebuild from the notes
 *   npm run indexar -- --buscar "pergunta"   quick check of the main index (reviewed notes only)
 */
import { IndiceVault } from '../src/ponte/vault/indice.js';
import { LocalEmbedder } from '../src/ponte/vault/embedder.js';

const args = process.argv.slice(2);
const arquivo = process.env.INDICE_PATH ?? `${process.env.DB_PATH ?? './copiloto.db'}.indice`;
const indice = await IndiceVault.abrir(new LocalEmbedder(), arquivo);
console.log(JSON.stringify(await indice.sincronizar(args.includes('--total')), null, 2));

const i = args.indexOf('--buscar');
if (i >= 0 && args[i + 1]) {
  const r = await indice.buscar('principal', args[i + 1]);
  console.log(r.length ? r.map((x) => `\n${x.caminho} (${x.pontuacao})\n${x.trecho.slice(0, 300)}`).join('\n') : '\nNenhum resultado.');
}
