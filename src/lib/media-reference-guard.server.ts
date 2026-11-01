type MediaReferenceSql = {
  query<T = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<T[]>;
};

export function mediaReferenceNeedles(url: string, liaraKey?: string | null): string[] {
  const values = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = value?.trim();
    if (normalized) values.add(normalized);
  };

  add(url);
  add(liaraKey);
  if (liaraKey) add(encodeURIComponent(liaraKey));

  const databaseMediaMatch = url.match(/\/api\/media\/([^/?#]+)/);
  if (databaseMediaMatch?.[1]) {
    try {
      add(`/api/media/${decodeURIComponent(databaseMediaMatch[1])}`);
    } catch {
      add(`/api/media/${databaseMediaMatch[1]}`);
    }
  }

  try {
    const parsed = new URL(url, "https://hirmand.invalid");
    if (parsed.pathname !== "/api/liara-media") {
      add(parsed.pathname);
      if (parsed.origin !== "https://hirmand.invalid") add(`${parsed.origin}${parsed.pathname}`);
      try {
        add(decodeURIComponent(parsed.pathname));
      } catch {
        // Keep the encoded path candidate already added above.
      }
    }
    const nestedUrl = parsed.searchParams.get("url");
    if (nestedUrl) {
      add(nestedUrl);
      add(encodeURIComponent(nestedUrl));
      try {
        const nested = new URL(nestedUrl);
        add(nested.pathname);
        add(`${nested.origin}${nested.pathname}`);
      } catch {
        // The nested URL string and its encoded form remain valid candidates.
      }
    }
  } catch {
    // The original value is still a useful reference needle.
  }

  for (const value of [...values]) {
    if (value.includes("/") || value.includes(":")) add(encodeURIComponent(value));
  }
  return [...values];
}

/** Fail closed when any persisted record still contains this media URL or object key. */
export async function hasMediaUrlReferences(
  sql: MediaReferenceSql,
  url: string,
  liaraKey?: string | null,
  options: { ignoreVideoManifestSourceUrl?: string } = {},
): Promise<boolean> {
  const needles = mediaReferenceNeedles(url, liaraKey);
  if (!needles.length) return false;
  const rows = await sql.query<{ referenced: boolean }>(
    `with needles as (
       select unnest($1::text[]) as needle
     ), media_refs as (
       select images::text as value from properties
       union all select floor_plan_url from properties
       union all select virtual_tour_url from properties
       union all select url from music_tracks
       union all select property_data::text from customer_property_submissions
       union all select file_url from admin_deal_documents
       union all select source_url from property_video_renditions where ($2::text is null or source_url <> $2)
       union all select renditions::text from property_video_renditions where ($2::text is null or source_url <> $2)
       union all select stored_url from property_media_upload_sessions where state <> 'failed'
       union all select '/api/media/' || stored_media_id from property_media_upload_sessions where state <> 'failed' and stored_media_id is not null
       union all select completion_result::text from property_media_upload_sessions where state <> 'failed'
       union all select stored_url from media_upload_sessions where completion_state <> 'failed'
       union all select '/api/media/' || stored_media_id from media_upload_sessions where completion_state <> 'failed' and stored_media_id is not null
       union all select completion_result::text from media_upload_sessions where completion_state <> 'failed'
       union all select hero_image from area_contents
       union all select gallery::text from area_contents
     )
     select exists (
       select 1 from media_refs r cross join needles n
       where n.needle <> '' and position(n.needle in coalesce(r.value,'')) > 0
     ) as referenced`,
    [needles, options.ignoreVideoManifestSourceUrl ?? null],
  );
  return rows[0]?.referenced === true;
}

function collectStringValues(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, output);
  }
  return output;
}

/** Remove a video's rendition manifest only after every non-manifest owner has released its source. */
export async function removeOrphanedVideoRenditionManifest(
  sql: MediaReferenceSql,
  url: string,
  liaraKey?: string | null,
): Promise<{ removed: boolean; renditionUrls: string[] }> {
  const needles = mediaReferenceNeedles(url, liaraKey);
  const manifests = await sql.query<{ source_url: string; renditions: unknown }>(
    "select source_url,renditions from property_video_renditions where source_url = any($1::text[]) or exists (select 1 from unnest($1::text[]) as needles(needle) where length(needle) >= 8 and position(needle in property_video_renditions.source_url) > 0) limit 2",
    [needles],
  );
  if (manifests.length !== 1) return { removed: false, renditionUrls: [] };
  const manifest = manifests[0];
  const renditionState = manifest.renditions && typeof manifest.renditions === "object"
    ? manifest.renditions as Record<string, unknown>
    : null;
  // created_at is not a lease: FFmpeg can run longer than 30 minutes without
  // publishing a rendition. Only the encoder may clear its processing flag.
  if (renditionState?.processing === true) return { removed: false, renditionUrls: [] };
  if (await hasMediaUrlReferences(sql, url, liaraKey, { ignoreVideoManifestSourceUrl: manifest.source_url })) {
    return { removed: false, renditionUrls: [] };
  }
  const deleted = await sql.query<{ renditions: unknown }>(
    "delete from property_video_renditions where source_url=$1 returning renditions",
    [manifest.source_url],
  );
  if (!deleted.length) return { removed: false, renditionUrls: [] };
  return { removed: true, renditionUrls: collectStringValues(deleted[0].renditions) };
}
