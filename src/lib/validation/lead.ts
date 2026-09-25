export interface LeadFormValues {
  business_name: string;
  mobile: string;
  facebook_page_url: string;
  website_url: string;
  current_situation: string;
}

export type LeadFieldErrors = Partial<Record<keyof LeadFormValues, string>>;

const URL_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const MOBILE_PATTERN = /^[0-9+\-\s()]{7,20}$/;

export function validateLead(values: LeadFormValues): LeadFieldErrors {
  const errors: LeadFieldErrors = {};

  if (!values.business_name.trim() || values.business_name.trim().length < 2) {
    errors.business_name = "Enter your business name.";
  } else if (values.business_name.length > 200) {
    errors.business_name = "Business name is too long.";
  }

  if (!values.mobile.trim()) {
    errors.mobile = "Enter a mobile number.";
  } else if (!MOBILE_PATTERN.test(values.mobile.trim())) {
    errors.mobile = "Enter a valid mobile number.";
  }

  if (values.facebook_page_url.trim() && !URL_PATTERN.test(values.facebook_page_url.trim())) {
    errors.facebook_page_url = "Enter a valid URL (starting with http:// or https://).";
  }

  if (values.website_url.trim() && !URL_PATTERN.test(values.website_url.trim())) {
    errors.website_url = "Enter a valid URL (starting with http:// or https://).";
  }

  if (!values.current_situation.trim() || values.current_situation.trim().length < 10) {
    errors.current_situation = "Tell us a bit more about your current business situation.";
  } else if (values.current_situation.length > 4000) {
    errors.current_situation = "Please shorten your answer.";
  }

  return errors;
}
