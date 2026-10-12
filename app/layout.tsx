import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Manga Flow - Read Manga, Manhwa & Webtoons',
  description: 'Fast, automated Manga and Webtoon reader with continuous scroll.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased selection:bg-indigo-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}
