import { z } from "zod";
import { ALLOWED_PHOTO_TYPES, MAX_PHOTOS, MAX_PHOTO_BYTES, REPORT_REASONS } from "@/lib/domain/constants";

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Display name must be at least 2 characters").max(60, "Display name must be at most 60 characters"),
  email: z.union([z.literal(""), z.email("Enter a valid email address").max(254, "Email is too long")]),
});

export const otpCodeSchema = z.string().trim().regex(/^\d{4,10}$/, "Enter the numeric code from your SMS");

export const reportSchema = z.object({
  listingId: z.uuid(),
  reason: z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]], { error: "Choose a reason" }),
  details: z.string().trim().max(1000, "Details must be at most 1000 characters"),
});

export const respondSchema = z.object({
  requestId: z.uuid(),
  decision: z.enum(["accepted", "declined"]),
  response: z.string().trim().max(500, "Response must be at most 500 characters"),
});

export const moderationSchema = z.object({
  id: z.uuid(),
  status: z.enum(["ok", "suspended"]),
  note: z.string().trim().max(500),
});

export const accountStatusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(500),
});

export const resolveReportSchema = z.object({
  reportId: z.uuid(),
  status: z.enum(["actioned", "dismissed"]),
  note: z.string().trim().max(500),
});

/** Client + server pre-checks for photo uploads (Storage bucket config and RLS enforce the same limits). */
export function validatePhotoFile(file: { type: string; size: number; name?: string }, existingCount: number): string | null {
  if (existingCount >= MAX_PHOTOS) return `You can upload at most ${MAX_PHOTOS} photos.`;
  if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) return "Only JPEG, PNG or WebP images are allowed.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_PHOTO_BYTES) return `Each photo must be smaller than ${MAX_PHOTO_BYTES / 1024 / 1024} MB.`;
  return null;
}

export function photoExtension(type: string): "jpg" | "png" | "webp" | null {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return null;
}

/** Storage object path: <owner_id>/<listing_id>/<uuid>.<ext> — must match the bucket policy. */
export function buildPhotoPath(ownerId: string, listingId: string, type: string, id: string = crypto.randomUUID()): string | null {
  const ext = photoExtension(type);
  return ext ? `${ownerId}/${listingId}/${id}.${ext}` : null;
}
