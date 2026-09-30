/** IndexedDB for completed job artifacts so history can re-download. */

export type StoredArtifact = {
  id: string;
  name: string;
  type: string;
  size: number;
  inputSize: number;
  note?: string;
  toolId: string;
  toolTitle: string;
  time: string;
  count: number;
  blob: Blob;
};

const DB_NAME = 'toolbox-history';
const STORE = 'artifacts';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putArtifacts(items: Omit<StoredArtifact, 'id'>[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const item of items) {
      store.put({ ...item, id: `${item.time}-${item.name}-${Math.random().toString(36).slice(2, 8)}` });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  // keep store bounded
  const all = await listArtifacts();
  if (all.length > 80) {
    const drop = all.slice(80);
    await deleteArtifacts(drop.map((d) => d.id));
  }
}

export async function listArtifacts(): Promise<StoredArtifact[]> {
  const db = await openDb();
  const items = await new Promise<StoredArtifact[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as StoredArtifact[]).sort((a, b) =>
        b.time.localeCompare(a.time)
      );
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

export async function deleteArtifacts(ids: string[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearArtifacts(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
