// app/layout.tsx
import type { Metadata } from 'next';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata: Metadata = {
  title: 'BOQ Generator — Amaryllis Success',
  description: 'AI-powered Bill of Quantities extraction from engineering drawings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0f1117' }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
