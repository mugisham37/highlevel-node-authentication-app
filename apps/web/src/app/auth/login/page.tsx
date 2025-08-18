import { LoginForm } from '@/components/auth';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In - Fullstack Monolith',
  description: 'Sign in to your account',
};

export default function LoginPage() {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome back</h1>
      <p className="text-gray-600">Sign in to your account to continue</p>

      <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        <LoginForm />
      </div>
    </div>
  );
}
