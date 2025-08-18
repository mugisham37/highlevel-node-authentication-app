'use client';

import { TrpcProvider } from './trpc-provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <TrpcProvider>{children}</TrpcProvider>;
}
