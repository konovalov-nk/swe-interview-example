import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.LOT_PACKAGES || 'https://linuxontab.com/packages';
const DEST = path.resolve('vendor/packages');

// Pinned package set used by the golden image.  Keep these versions in sync
// with the overlay in public/overlays/.
const FILES = [
  'index.json',
  'python3-3.11.14-r2.tar.gz',
  'tmux-3.5a-r1.tar.gz',
  'nano-8.3-r1.tar.gz',
];

fs.mkdirSync(DEST, { recursive: true });

for (const name of FILES) {
  const out = path.join(DEST, name);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) {
    console.log('have', name);
    continue;
  }
  console.log('fetch', `${BASE}/${name}`);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log('wrote', name, `${(buf.length / 1048576).toFixed(1)} MB`);
}

console.log(`\npackages ready in ${DEST}`);
