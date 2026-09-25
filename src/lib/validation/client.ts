export interface ClientFormValues {
  business_name: string;
  website: string;
  phone: string;
  facebook_page_url: string;
  drive_folder_id: string;
}

export type ClientFieldErrors = Partial<Record<keyof ClientFormValues, string>>;

const URL_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const PHONE_PATTERN = /^[0-9+\-\s()]{0,20}$/;

export function validateClient(values: ClientFormValues): ClientFieldErrors {
  const errors: ClientFieldErrors = {};

  if (!values.business_name.trim() || values.business_name.trim().length < 2) {
    errors.business_name = "Enter the business name.";
  } else if (values.business_name.length > 200) {
    errors.business_name = "Business name is too long.";
  }

  if (values.website.trim() && !URL_PATTERN.test(values.website.trim())) {
    errors.website = "Enter a valid URL (starting with http:// or https://).";
  }

  if (values.facebook_page_url.trim() && !URL_PATTERN.test(values.facebook_page_url.trim())) {
    errors.facebook_page_url = "Enter a valid URL (starting with http:// or https://).";
  }

  if (values.phone.trim() && !PHONE_PATTERN.test(values.phone.trim())) {
    errors.phone = "Enter a valid phone number.";
  }

  return errors;
}
