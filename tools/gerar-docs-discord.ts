/**
 * Generates docs/discord-canais.md from src/ponte/discord/ajuda.ts.
 * Run with `npm run docs:discord`; a test fails if the committed file is out of date.
 */
import { writeFileSync } from 'fs';
import { docsDiscord } from '../src/ponte/discord/docs.js';

writeFileSync('docs/discord-canais.md', docsDiscord());
console.log('docs/discord-canais.md atualizado');
