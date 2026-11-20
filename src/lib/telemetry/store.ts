import { SESSION_LIMIT, type SessionBundle } from "./types";

const DB_NAME = "swe-interview-sessions";
const STORE = "sessions";

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, SessionBundle>();

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return dbPromise;
}

function resultOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function trimMemory(): void {
  const all = [...memory.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const old of all.slice(SESSION_LIMIT)) memory.delete(old.id);
}

async function readAll(): Promise<SessionBundle[]> {
  const db = await openDb();
  if (!db) {
    return [...memory.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  const tx = db.transaction(STORE, "readonly");
  const all = await resultOf(tx.objectStore(STORE).getAll() as IDBRequest<SessionBundle[]>);
  await done(tx);
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function listSessions(): Promise<SessionBundle[]> {
  return (await readAll()).slice(0, SESSION_LIMIT);
}

export async function saveSession(bundle: SessionBundle): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.set(bundle.id, bundle);
    trimMemory();
    return;
  }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(bundle);
  await done(tx);
  const all = await readAll();
  for (const old of all.slice(SESSION_LIMIT)) await deleteSession(old.id);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.delete(id);
    return;
  }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await done(tx);
}

export async function deleteAllSessions(): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.clear();
    return;
  }
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await done(tx);
}

export async function gzipJson(value: unknown): Promise<Blob> {
  const text = JSON.stringify(value, null, 2);
  if (typeof CompressionStream === "undefined") {
    return new Blob([text], { type: "application/json" });
  }
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Blob([buffer], { type: "application/gzip" });
}

export function sessionFileName(bundle: SessionBundle): string {
  const stamp = bundle.startedAt.replace(/[:.]/g, "-");
  return `swe-session-${stamp}.json.gz`;
}

export async function downloadSession(bundle: SessionBundle): Promise<void> {
  const blob = await gzipJson(bundle);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sessionFileName(bundle);
  anchor.click();
  URL.revokeObjectURL(url);
}
