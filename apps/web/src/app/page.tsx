import { env } from '@/lib/env';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto text-center">
        <div className="bg-white rounded-2xl shadow-soft p-8 md:p-12">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">{env.APP_NAME}</h1>

          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Modern authentication platform with enterprise-grade security, multi-factor
            authentication, and seamless user experience.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="p-6 bg-primary-50 rounded-xl">
              <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure Authentication</h3>
              <p className="text-gray-600">
                Multi-factor authentication, WebAuthn, and enterprise SSO support.
              </p>
            </div>

            <div className="p-6 bg-success-50 rounded-xl">
              <div className="w-12 h-12 bg-success-600 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">High Performance</h3>
              <p className="text-gray-600">
                Built with Next.js, React Query, and optimized for speed.
              </p>
            </div>

            <div className="p-6 bg-warning-50 rounded-xl">
              <div className="w-12 h-12 bg-warning-600 rounded-lg flex items-center justify-center mb-4 mx-auto">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Developer Experience</h3>
              <p className="text-gray-600">
                Type-safe APIs, comprehensive testing, and excellent tooling.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/auth/login"
              className="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-lg text-white bg-primary-600 hover:bg-primary-700 transition-colors"
            >
              Get Started
            </a>
            <a
              href="/auth/register"
              className="inline-flex items-center justify-center px-8 py-3 text-lg font-medium rounded-lg text-primary-600 bg-white border border-primary-600 hover:bg-primary-50 transition-colors"
            >
              Create Account
            </a>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Version {env.APP_VERSION} • Built with Next.js, TypeScript, and Tailwind CSS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
