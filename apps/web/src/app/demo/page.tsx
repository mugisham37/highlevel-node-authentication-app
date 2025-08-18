import {
  LoginForm,
  MfaSetupForm,
  MfaVerificationForm,
  PasswordResetForm,
  RegisterForm,
  SocialAuthButtons,
} from '@/components/auth';
import { PublicLayout } from '@/components/layout';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication Components Demo - Fullstack Monolith',
  description: 'Demo of all authentication UI components',
};

export default function DemoPage() {
  return (
    <PublicLayout>
      <div className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Authentication Components Demo
            </h1>
            <p className="text-xl text-gray-600">
              Showcase of all authentication UI components with type-safe tRPC integration
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
            {/* Login Form */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Login Form</h2>
              <LoginForm />
            </div>

            {/* Register Form */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Registration Form</h2>
              <RegisterForm />
            </div>

            {/* Password Reset Form */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Password Reset</h2>
              <PasswordResetForm />
            </div>

            {/* MFA Setup Form */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">MFA Setup</h2>
              <MfaSetupForm
                onSuccess={() => console.log('MFA setup completed')}
                onCancel={() => console.log('MFA setup cancelled')}
              />
            </div>

            {/* MFA Verification Form */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">MFA Verification</h2>
              <MfaVerificationForm
                method="totp"
                onSuccess={() => console.log('MFA verification completed')}
                onCancel={() => console.log('MFA verification cancelled')}
              />
            </div>

            {/* Social Auth Buttons */}
            <div className="bg-white rounded-lg shadow-soft p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Social Authentication</h2>
              <SocialAuthButtons />
            </div>
          </div>

          <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Features Implemented</h3>
            <ul className="text-blue-800 space-y-1">
              <li>✅ Login form with validation using react-hook-form</li>
              <li>✅ Registration form with email verification flow</li>
              <li>✅ Password reset with token validation</li>
              <li>✅ Two-factor authentication setup and verification</li>
              <li>✅ Social authentication buttons for OAuth providers</li>
              <li>✅ Type-safe API communication with tRPC</li>
              <li>✅ Comprehensive form validation with Zod schemas</li>
              <li>✅ Responsive design for all screen sizes</li>
              <li>✅ Loading states and error handling</li>
              <li>✅ Password strength indicators</li>
              <li>✅ Device fingerprinting for security</li>
            </ul>
          </div>

          <div className="mt-8 text-center">
            <p className="text-gray-600">
              All components are fully functional and ready for production use.
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
