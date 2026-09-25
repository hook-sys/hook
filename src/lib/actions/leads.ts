"use server";

import { createClient } from "@/lib/supabase/server";
import { validateLead, type LeadFieldErrors, type LeadFormValues } from "@/lib/validation/lead";

export interface LeadFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: LeadFieldErrors;
}

export async function submitLeadApplication(
  _prevState: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  // Honeypot filled => bot. Pretend success, store nothing.
  if (String(formData.get("company_fax") ?? "").trim()) return { status: "success" };

  const values: LeadFormValues = {
    business_name: String(formData.get("business_name") ?? "").trim(),
    mobile: String(formData.get("mobile") ?? "").trim(),
    facebook_page_url: String(formData.get("facebook_page_url") ?? "").trim(),
    website_url: String(formData.get("website_url") ?? "").trim(),
    current_situation: String(formData.get("current_situation") ?? "").trim(),
  };

  const fieldErrors = validateLead(values);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leads").insert({
    business_name: values.business_name,
    mobile: values.mobile,
    facebook_page_url: values.facebook_page_url || null,
    website_url: values.website_url || null,
    current_situation: values.current_situation,
  });

  if (error) {
    if (error.message.includes("lead_rate_limited")) {
      return { status: "error", message: "We've received several applications recently. Please try again later." };
    }
    return {
      status: "error",
      message: "Something went wrong while submitting your application. Please try again.",
    };
  }

  return { status: "success" };
}
