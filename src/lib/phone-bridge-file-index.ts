import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";

export type PhoneBridgeFileEntryInput = {
  uri?: unknown;
  parentUri?: unknown;
  name?: unknown;
  relativePath?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  modifiedAt?: unknown;
  isDirectory?: unknown;
};

function boundedText(value: unknown, fallback: string, maxLength: number) {
  return (typeof value === "string" ? value : fallback).trim().slice(0, maxLength) || fallback;
}

function nonNegativeSafeInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

/** Replace one device's index atomically so a failed upload never erases its last good tree. */
export async function replacePhoneBridgeFileIndex(
  sql: Sql,
  input: { deviceId: string; rootUri: string; entries: PhoneBridgeFileEntryInput[] },
) {
  if (!sql.transaction) throw new Error("Phone Bridge file index requires transaction support.");

  const rootUri = input.rootUri.trim().slice(0, 2000);
  if (!rootUri) throw new Error("Phone Bridge file index root URI is required.");
  if (input.entries.length > 1800) throw new Error("Phone Bridge file index exceeds the 1800 entry limit.");

  const seenUris = new Set<string>();
  const entries = input.entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const uri = boundedText(entry.uri, "", 3000);
    if (!uri || seenUris.has(uri)) return [];
    seenUris.add(uri);
    const name = boundedText(entry.name, "file", 300);
    return [{
      id: randomUUID(),
      uri,
      parentUri: boundedText(entry.parentUri, "", 3000),
      name,
      relativePath: boundedText(entry.relativePath, name, 3000),
      mimeType: boundedText(entry.mimeType, "application/octet-stream", 180),
      sizeBytes: nonNegativeSafeInteger(entry.sizeBytes),
      modifiedAt: nonNegativeSafeInteger(entry.modifiedAt),
      isDirectory: entry.isDirectory === true,
    }];
  });

  await sql.transaction(async (tx) => {
    const devices = await tx.query<{ id: string }>(
      "select id from phone_bridge_devices where id=$1 for update",
      [input.deviceId],
    );
    if (!devices.length) throw new Error("Phone Bridge device is unavailable for file indexing.");
    await tx.query("delete from phone_bridge_file_entries where device_id=$1", [input.deviceId]);
    if (entries.length) {
      const valuesPerEntry = 11;
      const placeholders = entries.map((_, index) => {
        const first = index * valuesPerEntry + 1;
        return `(${Array.from({ length: valuesPerEntry }, (_value, offset) => `$${first + offset}`).join(",")})`;
      }).join(",");
      const values = entries.flatMap((entry) => [
        entry.id, input.deviceId, rootUri, entry.uri, entry.parentUri, entry.name,
        entry.relativePath, entry.mimeType, entry.sizeBytes, entry.modifiedAt, entry.isDirectory,
      ]);
      await tx.query(
        `insert into phone_bridge_file_entries
           (id,device_id,root_uri,uri,parent_uri,name,relative_path,mime_type,size_bytes,modified_at,is_directory)
         values ${placeholders}`,
        values,
      );
    }
  });

  return entries.length;
}
