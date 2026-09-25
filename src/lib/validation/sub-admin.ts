export interface SubAdminFormValues {
  full_name: string;
  email: string;
  password: string;
}

export type SubAdminFieldErrors = Partial<Record<keyof SubAdminFormValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSubAdmin(values: SubAdminFormValues): SubAdminFieldErrors {
  const errors: SubAdminFieldErrors = {};

  if (!values.full_name.trim() || values.full_name.trim().length < 2) {
    errors.full_name = "Enter the sub-admin's full name.";
  }

  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  }

  return errors;
}
