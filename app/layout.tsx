import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'BOQ Generator — Amaryllis Success',
  description: 'AI-powered Bill of Quantities extraction from engineering drawings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body style={{ margin: 0, background: '#0f1117' }}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
