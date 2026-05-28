import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Try common locations so `npm run dev` works from repo root or from `services/signaling`. */
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(process.cwd(), '..', '..', '.env'),
  // services/signaling/src -> repo root
  path.resolve(__dirname, '..', '..', '..', '.env'),
  // services/signaling/dist -> repo root
  path.resolve(__dirname, '..', '..', '..', '..', '.env'),
];

for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    config({ path: p });
    break;
  }
}
