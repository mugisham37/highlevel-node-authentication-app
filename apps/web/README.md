# Web Frontend Application

This is the Next.js web frontend application for the Fullstack Monolith
Authentication Platform.

## Features

- **Next.js 15** with App Router and TypeScript
- **Tailwind CSS** for styling with custom design system
- **React Query** for state management and API caching
- **tRPC** for type-safe API communication
- **React Hook Form** for form handling and validation
- **Responsive Design** optimized for desktop, tablet, and mobile

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The application will be available at
[http://localhost:3000](http://localhost:3000).

### Environment Variables

Copy `.env.local` and update the values:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001

# Application Configuration
NEXT_PUBLIC_APP_NAME="Fullstack Monolith"
NEXT_PUBLIC_APP_VERSION="1.0.0"

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

## Scripts

- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint issues
- `pnpm type-check` - Run TypeScript type checking
- `pnpm test` - Run tests
- `pnpm test:watch` - Run tests in watch mode

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── providers/         # Context providers
│   └── ui/                # UI components
├── lib/                   # Utility libraries
│   ├── react-query.ts     # React Query configuration
│   ├── trpc.ts           # tRPC client setup
│   ├── utils.ts          # Utility functions
│   ├── env.ts            # Environment configuration
│   └── constants.ts      # Application constants
└── types/                 # TypeScript type definitions
```

## Key Technologies

- **Next.js 15**: React framework with App Router
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS**: Utility-first CSS framework
- **React Query**: Data fetching and caching
- **tRPC**: End-to-end type safety
- **React Hook Form**: Form handling
- **Zod**: Schema validation

## Integration with Workspace

This application integrates with the following workspace packages:

- `@company/shared` - Shared domain logic and types
- `@company/api-contracts` - tRPC API contracts
- `@company/ui` - Shared UI components (when available)

## Development

### Adding New Pages

Pages are created in the `src/app/` directory following Next.js App Router
conventions:

```typescript
// src/app/dashboard/page.tsx
export default function DashboardPage() {
  return <div>Dashboard</div>;
}
```

### API Integration

Use tRPC for type-safe API calls:

```typescript
import { trpc } from '@/lib/trpc';

function UserProfile() {
  const { data: user } = trpc.user.profile.useQuery();
  return <div>{user?.name}</div>;
}
```

### Styling

Use Tailwind CSS classes with the custom design system:

```typescript
<button className="btn-primary">
  Primary Button
</button>
```

## Testing

Tests are configured with Jest and React Testing Library:

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Building for Production

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

## Deployment

The application can be deployed to any platform that supports Next.js:

- Vercel (recommended)
- Netlify
- AWS Amplify
- Docker containers

See the [Next.js deployment documentation](https://nextjs.org/docs/deployment)
for more details.
