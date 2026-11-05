// Export the verified raga dictionary for the Go AI gateway.
// The gateway builds every Gemini prompt server-side, so it needs the same
// scales the browser uses. Run after any change to src/utils/ragaLogic.js:
//   npm run export:ragas

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { RAGAS } from '../src/utils/ragaLogic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../gateway/ragas.json');

// Bar lines and rests are display notation, not scale notes.
const NOTATION = new Set(['|', '||', ',']);
const clean = (notes = []) => notes.filter(n => !NOTATION.has(n));

// An array keeps the dictionary order, which the prompts list in.
const ragas = Object.entries(RAGAS).map(([name, data]) => ({
  name,
  arohanam: clean(data.arohanam),
  avarohanam: clean(data.avarohanam),
  type: data.type || '',
  description: data.description || '',
}));

writeFileSync(OUT, JSON.stringify(ragas, null, 2) + '\n');
console.log(`Wrote ${ragas.length} ragas to gateway/ragas.json`);
