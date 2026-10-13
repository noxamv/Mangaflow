import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Manga Flow - Automated Cloud Reader',
  description: 'Fast, ad-supported manga and manhwa reader',
  referrer: 'no-referrer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="bg-[#0a0a0c] text-neutral-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
