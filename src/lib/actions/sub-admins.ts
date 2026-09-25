"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateSubAdmin, type SubAdminFieldErrors } from "@/lib/validation/sub-admin";

export interface SubAdminFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: SubAdminFieldErrors;
}

export async function createSubAdmin(
  _prevState: SubAdminFormState,
  formData: FormData
): Promise<SubAdminFormState> {
  await requireSuperAdmin();

  const values = {
    full_name: String(formData.get("full_name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };

  const fieldErrors = validateSubAdmin(values);
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please correct the highlighted fields.", fieldErrors };
  }

  const clientIds = formData.getAll("client_ids").map(String).filter(Boolean);
  const permissionIds = formData.getAll("permission_ids").map(String).filter(Boolean);

  let adminAuth;
  try {
    adminAuth = createAdminClient();
  } catch {
    return {
      status: "error",
      message: "Server is not configured with SUPABASE_SERVICE_ROLE_KEY. Set it in your environment to create sub-admin accounts.",
    };
  }

  const { data: created, error: createError } = await adminAuth.auth.admin.createUser({
    email: values.email,
    password: values.password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return {
      status: "error",
      message: createError?.message ?? "Could not create the account.",
    };
  }

  const newUserId = created.user.id;
  const supabase = await createClient();

  const { error: profileError } = await supabase.from("admin_users").insert({
    id: newUserId,
    email: values.email,
    full_name: values.full_name,
    role: "sub_admin",
  });

  if (profileError) {
    await adminAuth.auth.admin.deleteUser(newUserId);
    return { status: "error", message: "Could not save the sub-admin profile. No account was created." };
  }

  if (clientIds.length > 0) {
    await supabase
      .from("client_assignments")
      .insert(clientIds.map((client_id) => ({ admin_user_id: newUserId, client_id })));
  }

  if (permissionIds.length > 0) {
    await supabase
      .from("admin_user_permissions")
      .insert(permissionIds.map((permission_id) => ({ admin_user_id: newUserId, permission_id })));
  }

  revalidatePath("/admin/sub-admins");
  redirect("/admin/sub-admins");
}

export async function toggleAdminActive(formData: FormData): Promise<void> {
  const currentAdmin = await requireSuperAdmin();

  const targetId = String(formData.get("admin_user_id") ?? "");
  const targetRole = String(formData.get("role") ?? "");
  const currentlyActive = formData.get("is_active") === "true";

  if (!targetId || targetId === currentAdmin.id || targetRole === "admin") {
    return;
  }

  const supabase = await createClient();
  await supabase.from("admin_users").update({ is_active: !currentlyActive }).eq("id", targetId);

  revalidatePath("/admin/sub-admins");
}
