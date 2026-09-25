import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthCard subtitle="Reset your admin password">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
