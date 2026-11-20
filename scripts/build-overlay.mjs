/**
 * Build the golden LinuxOnTab overlay used by the interview.
 *
 * Boots the vendored WASM Linux, installs Python + tmux + nano from the
 * pinned package set in vendor/packages, injects the guest agent and its FIFO
 * command runner, exports the dirty ext4 extents (the page-side build hook),
 * and gzips them into public/overlays/swe-base.data.gz.
 *
 * Requirements:
 *   npm run fetch:packages
 *   npx playwright install chromium     # or set CHROME_PATH
 *
 * The result is committed to the repo; end users never run this.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { startVmServer } from './vm-server.mjs';

const ROOT = process.cwd();
const PORT = Number(process.env.VM_PORT || 8130);
const OVERLAY = 'swe-base';
const OUT = path.join(ROOT, 'public', 'overlays');
const PKG = path.join(ROOT, 'vendor', 'packages', 'python3-3.11.14-r2.tar.gz');
const AGENT = path.join(ROOT, 'vm', 'lot-agent.py');
const RUNNER = path.join(ROOT, 'vm', 'lot-runner.sh');

for (const [file, label] of [
  [PKG, 'vendor/packages (run: npm run fetch:packages)'],
  [AGENT, 'vm/lot-agent.py'],
  [RUNNER, 'vm/lot-runner.sh'],
]) {
  if (!fs.existsSync(file)) {
    console.error('Missing ' + label);
    process.exit(1);
  }
}
fs.mkdirSync(OUT, { recursive: true });

const server = await startVmServer({ root: ROOT, port: PORT });
console.log(`vm server: http://localhost:${PORT}/vm/`);

const launchOptions = { headless: true };
if (process.env.CHROME_PATH) launchOptions.executablePath = process.env.CHROME_PATH;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
page.setDefaultTimeout(0);
page.on('console', (m) => {
  const t = m.text();
  if (/PKGDROP|apk|install|export|error|fail/i.test(t) && !/user-memory|\[TCP\]/.test(t)) {
    console.log('C', t.slice(0, 220));
  }
});
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 500)));

const downloads = [];
page.on('download', (d) => downloads.push(d));

const terminalText = () =>
  page.evaluate(() => document.querySelector('.xterm-rows')?.innerText || '');

async function send(line) {
  await page.evaluate((value) => window.guestSend(value), line);
  await page.waitForTimeout(150);
}

async function waitFor(re, label, timeoutMs = 180_000) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(1500);
    const text = await terminalText();
    if (text !== last) {
      last = text;
      console.log('T', Math.round((Date.now() - started) / 1000) + 's', JSON.stringify(text.slice(-420)));
    }
    if (re.test(text)) return text;
  }
  throw new Error(`timeout waiting for ${label}`);
}

try {
  console.log('booting base image…');
  await page.goto(`http://localhost:${PORT}/vm/?autoboot`, { waitUntil: 'domcontentloaded' });
  await waitFor(/~ #\s*$/, 'base shell', 90_000);

  console.log('installing python3, tmux, nano…');
  await send('apk add python3 tmux nano');
  await waitFor(/nano-8\.3-r1 installed[\s\S]*~ #\s*$/, 'tools', 300_000);

  await send('python3 --version; tmux -V; nano --version | head -1');
  await page.waitForTimeout(1500);

  console.log('injecting agent and runner…');
  for (const name of ['lot-agent.py', 'lot-runner.sh']) {
    await send(
      `/usr/local/bin/python3 -c "import urllib.request; open('/opt/${name}','wb').write(urllib.request.urlopen('http://192.168.86.1/_http/localhost:${PORT}/${name}').read())"`,
    );
    await page.waitForTimeout(500);
  }
  await send('/usr/local/bin/python3 -m py_compile /opt/lot-agent.py; echo COMPILE=$?');
  await waitFor(/COMPILE=0/, 'agent compile', 30_000);

  console.log('starting agent + runner…');
  await send(
    '/usr/local/bin/python3 -S /opt/lot-agent.py >/var/log/lot-agent.log 2>&1 & ' +
      '/bin/sh /opt/lot-runner.sh >/dev/null 2>&1 &',
  );

  let ping = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    try {
      ping = await page.evaluate(() => window.guestAgentCall(45999, { op: 'ping' }, 1500));
      if (ping?.ok) break;
    } catch {
      /* keep polling */
    }
  }
  if (!ping?.ok) throw new Error('guest agent did not start; see /var/log/lot-agent.log');
  console.log('agent ping:', ping);

  const runner = await page.evaluate(() =>
    window.guestAgentCall(45999, { op: 'exec', cmd: 'echo __RUNNER_OK__', cwd: '/root/work', timeout: 10 }, 15000),
  );
  console.log('runner:', runner);
  if (!runner?.ok || !String(runner.stdout).includes('__RUNNER_OK__')) {
    throw new Error('command runner did not start');
  }

  console.log('exporting overlay…');
  const result = await page.evaluate((name) => window.lotExportOverlay(name), OVERLAY);
  console.log('export result:', result);

  for (let i = 0; i < 60 && downloads.length < 2; i++) await page.waitForTimeout(500);
  if (downloads.length < 2) throw new Error('expected metadata + data downloads');

  await downloads[0].saveAs(path.join(OUT, `${OVERLAY}.json`));
  await downloads[1].saveAs(path.join(OUT, `${OVERLAY}.data`));

  const raw = path.join(OUT, `${OVERLAY}.data`);
  const gz = path.join(OUT, `${OVERLAY}.data.gz`);
  const compressed = zlib.gzipSync(fs.readFileSync(raw), { level: 9 });
  fs.writeFileSync(gz, compressed);
  fs.unlinkSync(raw);
  console.log(
    `overlay ready: ${gz} (${(compressed.length / 1048576).toFixed(1)} MB gz)`,
  );
  console.log(`metadata: ${path.join(OUT, `${OVERLAY}.json`)}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
