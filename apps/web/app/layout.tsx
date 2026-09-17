import type { Metadata } from 'next';
import { Prompt } from 'next/font/google';

import { Providers } from '../providers';
import './globals.css';

const prompt = Prompt({
  variable: '--font-prompt',
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
});

export const metadata: Metadata = {
  title: 'oauth-oidc-state-pkce-poc',
  description: 'External OAuth with revocable PostgreSQL application sessions',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${prompt.variable} font-prompt`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
