// app/dmca/page.tsx
import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'DMCA Notice & Copyright Policy — MangaFlow',
  description: 'MangaFlow Digital Millennium Copyright Act (DMCA) compliance and contact information.',
};

export default function DmcaPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-10 space-y-8 text-neutral-300">
      <div className="space-y-2 border-b border-neutral-800 pb-5">
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          DMCA Notice & Content Policy
        </h1>
        <p className="text-xs text-neutral-400">
          Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <section className="space-y-3 text-xs sm:text-sm leading-relaxed">
        <h2 className="text-base font-bold text-white">1. Service Provider Status</h2>
        <p>
          MangaFlow (<span className="text-indigo-400">mangaflow.tv</span>) is an online catalog index and web interface. MangaFlow does not host, scan, translate, or store any digital comic images, manga chapters, or video files on its servers. All images displayed in our reader are retrieved dynamically from publicly available, third-party internet media hosts.
        </p>
      </section>

      <section className="space-y-3 text-xs sm:text-sm leading-relaxed">
        <h2 className="text-base font-bold text-white">2. DMCA Compliance</h2>
        <p>
          It is our strict policy to respond promptly to valid notices of alleged copyright infringement in compliance with the Digital Millennium Copyright Act (Title 17, United States Code, Section 512). If your copyrighted work is indexed on MangaFlow and you wish to have it removed from our directory, please contact our designated agent.
        </p>
      </section>

      <section className="space-y-3 text-xs sm:text-sm leading-relaxed">
        <h2 className="text-base font-bold text-white">3. Takedown Notice Requirements</h2>
        <p>Your notification must include the following information:</p>
        <ul className="list-disc list-inside space-y-1.5 pl-2 text-neutral-400">
          <li>Identification of the copyrighted work claimed to have been infringed.</li>
          <li>The exact MangaFlow series URL(s) containing the reference to the material.</li>
          <li>Your legal name, address, telephone number, and verifiable corporate email address.</li>
          <li>A statement made under penalty of perjury that the information in the notification is accurate and you are the copyright owner or authorized agent.</li>
        </ul>
      </section>

      <section className="space-y-3 text-xs sm:text-sm leading-relaxed bg-[#13151f] p-5 rounded-2xl border border-neutral-800">
        <h2 className="text-base font-bold text-white">4. Designated Copyright Agent</h2>
        <p className="text-neutral-400">Please send all takedown notices directly to:</p>
        <div className="font-mono text-indigo-400 font-semibold text-xs sm:text-sm select-all">
          dmca.mangaflow@gmail.com
        </div>
        <p className="text-[11px] text-neutral-500">
          Upon receipt of a valid notice, catalog entries are delisted within 24–48 business hours.
        </p>
      </section>

      <div className="pt-4 border-t border-neutral-800 flex justify-between items-center text-xs">
        <Link href="/" className="text-indigo-400 hover:underline">
          ← Back to Catalog
        </Link>
      </div>
    </div>
  );
}
