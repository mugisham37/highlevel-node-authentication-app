import { RegisterForm } from '@/components/auth';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account - Fullstack Monolith',
  description: 'Create a new account to get started',
};

export default function RegisterPage() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Create your account</h1>
      <p className="text-gray-600">Join us and start your journey today</p>

      <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <RegisterForm />
      </div>
    </div>
  );
}
