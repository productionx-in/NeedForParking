"use server";

import { revalidatePath } from "next/cache";
import { fail, withUser } from "@/lib/actions";
import { fieldErrorsFromZod, friendlyDbError } from "@/lib/errors";
import { profileSchema } from "@/lib/validation/misc";
import type { ActionResult } from "@/lib/types";

export async function updateProfileAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return withUser(async ({ user, supabase }) => {
    const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") ?? "", email: formData.get("email") ?? "" });
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: parsed.data.displayName, email: parsed.data.email || null })
      .eq("id", user.id);
    if (error) return fail(friendlyDbError(error));
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Profile saved." };
  });
}
