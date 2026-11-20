import { chromium } from "playwright";
import fs from "node:fs";
import zlib from "node:zlib";

const base = process.env.BASE_URL || "https://swe-interview.br11k.dev";
const out = process.env.ARCHIVE_OUT || "/tmp/swe-session-e2e.json.gz";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(5000);

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const start = page.getByRole("button", { name: /Start attempt/i });
  for (let i = 0; i < 120; i += 1) {
    if (await start.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(1000);
  }
  if (!(await start.isEnabled())) throw new Error("Start button did not become enabled");

  const checkbox = page.locator(".record-opt input[type=checkbox]");
  if (await checkbox.isChecked()) throw new Error("Recording must be off by default");
  await checkbox.check();
  await start.click();
  await page.getByText("Recording", { exact: true }).waitFor();
  await page.getByText(/Tracking is locked during attempt/i).waitFor();

  await page.getByRole("button", { name: /Run tests/i }).click();
  await page.locator(".tests-summary").waitFor({ timeout: 120_000 });
  await page.getByRole("button", { name: /^End$/ }).click();
  await page.getByText(/Attempt ended/i).waitFor();

  await page.getByTitle("Saved sessions").click();
  await page.locator(".sessions-modal").waitFor();
  const rows = await page.locator(".sessions-modal .session-row").count();
  if (rows !== 1) throw new Error(`expected 1 session, got ${rows}`);

  await page.locator(".sessions-modal .session-actions .btn").nth(1).click();
  await page.locator(".analytics-modal").waitFor();
  const analytics = await page.locator(".analytics-modal").innerText();
  if (!analytics.includes("Session analytics")) throw new Error("analytics did not open");
  await page.locator(".analytics-modal .icon-btn").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator(".sessions-modal .session-actions .btn").first().click();
  const download = await downloadPromise;
  await download.saveAs(out);
  const raw = zlib.gunzipSync(fs.readFileSync(out));
  const bundle = JSON.parse(raw.toString("utf8"));
  if (bundle.schema !== "swe-interview/session@1") throw new Error("bad schema");
  const types = new Set(bundle.events.map((event) => event.type));
  for (const type of ["session.start", "session.end", "run.start", "run.end"]) {
    if (!types.has(type)) throw new Error(`missing event: ${type}`);
  }
  if (bundle.runs.length < 1) throw new Error("no runs in archive");
  if (!bundle.files["solution.py"]) throw new Error("solution.py is missing");

  await page.screenshot({ path: "/tmp/swe-session-e2e.png" });
  console.log(`E2E OK ${base}`);
  console.log(`archive ${out} ${fs.statSync(out).size} bytes`);
  console.log(`events ${bundle.events.length} runs ${bundle.runs.length} files ${Object.keys(bundle.files).length}`);
} finally {
  await browser.close();
}
