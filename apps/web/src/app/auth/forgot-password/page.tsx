import { PasswordResetForm } from '@/components/auth';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password - Fullstack Monolith',
  description: 'Reset your password',
};

export default function ForgotPasswordPage() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Reset your password</h1>
      <p className="text-gray-600">We'll help you get back into your account</p>

      <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <PasswordResetForm />
      </div>
    </div>
  );
}
