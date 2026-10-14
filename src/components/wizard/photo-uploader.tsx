"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { deletePhotoAction, prepareUploadAction, registerPhotoAction } from "@/app/actions/listings";
import { listingPhotoUrl, publicEnv } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase/client";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/domain/constants";
import { validatePhotoFile } from "@/lib/validation/misc";
import { Alert, Button } from "@/components/ui";

export type PhotoItem = { id: string; storage_path: string };
type Upload = { key: string; name: string; progress: number; error?: string; done?: boolean };

/** POSTs the file straight to Supabase Storage with the user's JWT (RLS-checked), reporting real upload progress. */
function uploadWithProgress(path: string, file: File, token: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${publicEnv.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/listing-photos/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", publicEnv.supabaseKey);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else if (xhr.status === 401 || xhr.status === 403) reject(new Error("You aren't allowed to upload to this listing."));
      else if (xhr.status === 413) reject(new Error("That file is too large."));
      else if (xhr.status === 415 || xhr.status === 400) reject(new Error("The server rejected that file type."));
      else reject(new Error("Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    const body = new FormData();
    body.append("cacheControl", "31536000");
    body.append("", file);
    xhr.send(body);
  });
}

export function PhotoUploader({ listingId, photos, onChange }: { listingId: string | null; photos: PhotoItem[]; onChange: (photos: PhotoItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const photosRef = useRef(photos);
  const seq = useRef(0);
  useEffect(() => {
    photosRef.current = photos;
  });

  const patch = (key: string, p: Partial<Upload>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function handleFiles(files: FileList | null) {
    if (!files || !listingId) return;
    setError(null);
    let count = photosRef.current.length;
    for (const file of Array.from(files)) {
      seq.current += 1;
      const key = `${seq.current}-${file.name}`;
      const problem = validatePhotoFile(file, count);
      if (problem) {
        setUploads((u) => [...u, { key, name: file.name, progress: 0, error: problem }]);
        continue;
      }
      setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
      try {
        const prep = await prepareUploadAction({ listingId, type: file.type, size: file.size, existingCount: count });
        if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Couldn't prepare the upload." : prep.error);
        const { data } = await getBrowserClient().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Your session expired. Please sign in again.");
        await uploadWithProgress(prep.data.path, file, token, (pct) => patch(key, { progress: pct }));
        const reg = await registerPhotoAction({ listingId, path: prep.data.path });
        if (!reg.ok || !reg.data) throw new Error(reg.ok ? "Couldn't save the photo." : reg.error);
        count += 1;
        patch(key, { progress: 100, done: true });
        onChange([...photosRef.current, { id: reg.data.id, storage_path: prep.data.path }]);
      } catch (e) {
        patch(key, { error: e instanceof Error ? e.message : "Upload failed." });
      }
    }
    if (input.current) input.current.value = "";
  }

  async function remove(photo: PhotoItem) {
    setError(null);
    const res = await deletePhotoAction(photo.id);
    if (res.ok) onChange(photosRef.current.filter((p) => p.id !== photo.id));
    else setError(res.error);
  }

  if (!listingId) {
    return <Alert tone="info">Save the previous steps first — photos are attached to your draft listing.</Alert>;
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          ref={input}
          id="photo-input"
          type="file"
          accept={ALLOWED_PHOTO_TYPES.join(",")}
          multiple
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <label htmlFor="photo-input" className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-400 bg-white px-4 text-sm font-semibold hover:bg-slate-100 focus-within:outline">
          Choose photos
        </label>
        <p className="mt-2 text-sm text-slate-600">
          JPEG, PNG or WebP · up to {MAX_PHOTO_BYTES / 1024 / 1024} MB each · {photos.length}/{MAX_PHOTOS} added. The first photo is the cover. Don&apos;t include number plates, people or documents.
        </p>
      </div>

      {uploads.length > 0 && (
        <ul className="space-y-2" aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.key} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate font-medium">{u.name}</span>
                <span className={u.error ? "text-red-700" : "text-slate-600"}>{u.error ? "Failed" : u.done ? "Uploaded" : `${u.progress}%`}</span>
              </div>
              {!u.error && (
                <div role="progressbar" aria-label={`Uploading ${u.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={u.progress} className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-brand-700 transition-[width]" style={{ width: `${u.progress}%` }} />
                </div>
              )}
              {u.error && <p role="alert" className="mt-1 text-red-700">{u.error}</p>}
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Listing photos">
          {photos.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="relative aspect-[4/3] bg-slate-100">
                <Image src={listingPhotoUrl(p.storage_path)} alt={`Listing photo ${i + 1}`} fill sizes="200px" className="object-cover" />
                {i === 0 && <span className="absolute left-2 top-2 rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">Cover</span>}
              </div>
              <div className="p-2">
                <Button variant="ghost" className="w-full" onClick={() => void remove(p)} aria-label={`Remove photo ${i + 1}`}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
