export type MusicUploadQueueItem = {
  uploadId: string;
  file: File;
  title: string;
  artist: string;
  message?: string;
  savedAt?: number;
};

type StoredMusicUploadQueueItem = {
  id: "active";
  uploadId: string;
  file: Blob;
  name: string;
  type: string;
  lastModified: number;
  title: string;
  artist: string;
  message: string;
  savedAt: number;
};

const MUSIC_UPLOAD_QUEUE_DB = "hirmand-admin-music-upload-queue-v2";
let queueWriteTail: Promise<void> = Promise.resolve();

function openMusicUploadQueueDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(MUSIC_UPLOAD_QUEUE_DB, 1);
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      resolve(database);
    };

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("queue")) {
        request.result.createObjectStore("queue", { keyPath: "id" });
      }
    };
    request.onsuccess = () => finish(request.result);
    request.onerror = () => finish(null);
    request.onblocked = () => finish(null);
  });
}

export function createMusicUploadId(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("مرورگر امکان ساخت شناسه امن برای تلاش مجدد آپلود را ندارد.");
  }
  return crypto.randomUUID();
}

async function writeMusicUploadQueueNow(
  item: MusicUploadQueueItem | null,
): Promise<boolean> {
  const database = await openMusicUploadQueueDb();
  if (!database) return false;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("queue", "readwrite");
      const store = transaction.objectStore("queue");
      if (!item) {
        store.delete("active");
      } else {
        const record: StoredMusicUploadQueueItem = {
          id: "active",
          uploadId: item.uploadId,
          file: item.file,
          name: item.file.name,
          type: item.file.type,
          lastModified: item.file.lastModified,
          title: item.title,
          artist: item.artist,
          message: item.message ?? "",
          savedAt: item.savedAt ?? Date.now(),
        };
        store.put(record);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch (error) {
    console.warn("[music-upload] Browser queue persistence failed", error);
    return false;
  } finally {
    database.close();
  }
}

function serializeQueueWrite(item: MusicUploadQueueItem | null): Promise<boolean> {
  const snapshot = item
    ? { ...item, file: item.file }
    : null;
  const write = () => writeMusicUploadQueueNow(snapshot);
  const result = queueWriteTail.then(write, write);
  queueWriteTail = result.then(() => undefined, () => undefined);
  return result;
}

export function persistMusicUploadQueue(item: MusicUploadQueueItem): Promise<boolean> {
  return serializeQueueWrite(item);
}

export function clearMusicUploadQueue(): Promise<boolean> {
  return serializeQueueWrite(null);
}

export async function readMusicUploadQueue(): Promise<MusicUploadQueueItem | null> {
  const database = await openMusicUploadQueueDb();
  if (!database) return null;

  try {
    const record = await new Promise<StoredMusicUploadQueueItem | undefined>((resolve, reject) => {
      const transaction = database.transaction("queue", "readonly");
      const request = transaction.objectStore("queue").get("active");
      request.onsuccess = () => resolve(request.result as StoredMusicUploadQueueItem | undefined);
      request.onerror = () => reject(request.error);
    });

    if (
      !record ||
      typeof record.uploadId !== "string" ||
      typeof record.name !== "string" ||
      typeof record.title !== "string" ||
      typeof record.artist !== "string" ||
      typeof Blob === "undefined" ||
      !(record.file instanceof Blob) ||
      typeof File === "undefined"
    ) {
      return null;
    }

    return {
      uploadId: record.uploadId,
      file: new File([record.file], record.name, {
        type: record.type || record.file.type,
        lastModified: Number(record.lastModified) || 0,
      }),
      title: record.title,
      artist: record.artist,
      message: record.message || "",
      savedAt: Number(record.savedAt) || 0,
    };
  } catch (error) {
    console.warn("[music-upload] Could not restore browser upload queue", error);
    return null;
  } finally {
    database.close();
  }
}
