'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Mock user state - in real app this would come from auth context
  const isAuthenticated = pathname.startsWith('/dashboard');
  const user = isAuthenticated ? { name: 'John Doe', email: 'john@example.com' } : null;

  const handleLogout = () => {
    // In real app, this would call logout mutation
    router.push('/auth/login');
  };

  return (
    <header className={cn('bg-white border-b border-gray-200 sticky top-0 z-50', className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
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
              <span className="text-xl font-bold text-gray-900">AuthPlatform</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-primary-600',
                    pathname === '/dashboard' ? 'text-primary-600' : 'text-gray-700'
                  )}
                >
                  Dashboard
                </Link>
                <Link
                  href="/dashboard/profile"
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-primary-600',
                    pathname === '/dashboard/profile' ? 'text-primary-600' : 'text-gray-700'
                  )}
                >
                  Profile
                </Link>
                <Link
                  href="/dashboard/security"
                  className={cn(
                    'text-sm font-medium transition-colors hover:text-primary-600',
                    pathname === '/dashboard/security' ? 'text-primary-600' : 'text-gray-700'
                  )}
                >
                  Security
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/auth/register"
                  className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
          </nav>

          {/* User Menu */}
          {isAuthenticated && user ? (
            <div className="hidden md:flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-600">
                    {user.name.charAt(0)}
                  </span>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900">{user.name}</div>
                  <div className="text-gray-500">{user.email}</div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Sign Out
              </Button>
            </div>
          ) : (
            <div className="hidden md:flex items-center space-x-4">
              <Link href="/auth/login">
                <Button variant="outline">Sign In</Button>
              </Link>
              <Link href="/auth/register">
                <Button>Get Started</Button>
              </Link>
            </div>
          )}

          {/* Mobile menu button */}
          <div className="md:hidden">
            <Button variant="ghost" size="sm" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4">
            <div className="flex flex-col space-y-4">
              {isAuthenticated ? (
                <>
                  <Link
                    href="/dashboard"
                    className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/profile"
                    className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/dashboard/security"
                    className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Security
                  </Link>
                  {user && (
                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-primary-600">
                            {user.name.charAt(0)}
                          </span>
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">{user.name}</div>
                          <div className="text-gray-500">{user.email}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleLogout} className="w-full">
                        Sign Out
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/auth/register"
                    className="text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Sign Up
                  </Link>
                  <div className="pt-4 border-t border-gray-200 space-y-2">
                    <Link href="/auth/login" onClick={() => setIsMenuOpen(false)}>
                      <Button variant="outline" className="w-full">
                        Sign In
                      </Button>
                    </Link>
                    <Link href="/auth/register" onClick={() => setIsMenuOpen(false)}>
                      <Button className="w-full">Get Started</Button>
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
