"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitLeadApplication, type LeadFormState } from "@/lib/actions/leads";

const initialLeadFormState: LeadFormState = { status: "idle" };
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Submitting..." : "Apply for Business Assessment"}
    </Button>
  );
}

export function ApplicationForm() {
  const [state, formAction] = useActionState(submitLeadApplication, initialLeadFormState);

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h3 className="text-xl font-semibold text-emerald-900">Application received</h3>
        <p className="mt-2 text-emerald-800">
          Your business information has been received. Our team will review it and
          contact you.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company_fax">Company fax</label>
        <input id="company_fax" name="company_fax" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <Label htmlFor="business_name">Business Name *</Label>
        <Input id="business_name" name="business_name" required maxLength={200} />
        {state.fieldErrors?.business_name && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.business_name}</p>
        )}
      </div>

      <div>
        <Label htmlFor="mobile">Mobile Number *</Label>
        <Input id="mobile" name="mobile" type="tel" required maxLength={20} />
        {state.fieldErrors?.mobile && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.mobile}</p>
        )}
      </div>

      <div>
        <Label htmlFor="facebook_page_url">Facebook Page Link</Label>
        <Input
          id="facebook_page_url"
          name="facebook_page_url"
          type="url"
          placeholder="https://facebook.com/yourpage"
        />
        {state.fieldErrors?.facebook_page_url && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.facebook_page_url}</p>
        )}
      </div>

      <div>
        <Label htmlFor="website_url">Website Link</Label>
        <Input id="website_url" name="website_url" type="url" placeholder="https://" />
        {state.fieldErrors?.website_url && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.website_url}</p>
        )}
      </div>

      <div>
        <Label htmlFor="current_situation">Current Business Situation *</Label>
        <Textarea
          id="current_situation"
          name="current_situation"
          required
          rows={5}
          maxLength={4000}
          placeholder="Tell us about your product, current sales, and what's not working yet."
        />
        {state.fieldErrors?.current_situation && (
          <p className="mt-1 text-sm text-red-600">{state.fieldErrors.current_situation}</p>
        )}
      </div>

      {state.status === "error" && state.message && !state.fieldErrors && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <SubmitButton />
    </form>
  );
}
