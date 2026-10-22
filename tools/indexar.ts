/**
 * Rebuilds or refreshes the semantic index outside the bridge (e.g. a nightly run):
 *   npm run indexar            incremental
 *   npm run indexar -- --total rebuild from the notes
 */
import { IndiceVault } from '../src/ponte/vault/indice.js';
import { LocalEmbedder } from '../src/ponte/vault/embedder.js';

const arquivo = process.env.INDICE_PATH ?? `${process.env.DB_PATH ?? './copiloto.db'}.indice`;
const indice = await IndiceVault.abrir(new LocalEmbedder(), arquivo);
console.log(JSON.stringify(await indice.sincronizar(process.argv.includes('--total')), null, 2));
