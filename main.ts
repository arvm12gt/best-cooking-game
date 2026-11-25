// Rush Hour Kitchen — hand-in program.
//
// Running this file delivers the entry: it copies the static game in
// game/ and the rendered screenshots in screenshots/ into the output
// directory, then asks the vendored make.fun library to summarise both
// into dossier.json, the document the judge reads.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts     (locally)
//   node main.ts                             (in the grader, output is /output)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy a whole folder from the repo into the output directory.
function deliverFolder(name: string): void {
  const from = join(repoDir, name);
  const to = join(outDir, name);
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

mkdirSync(outDir, { recursive: true });
deliverFolder('game');
deliverFolder('screenshots');

// Caps mirror the scorer's limits so an entry the gate would refuse is
// refused here first, at build time, instead of after submission.
const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, caps));
