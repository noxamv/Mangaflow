import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE credentials in environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function exportCatalog() {
  const { data: series, error } = await supabase
    .from('series')
    .select('id, title, status, series_intel(source_platform, target_url, latest_known_chapter), chapters(chapter_number)')
    .order('title', { ascending: true })
    .limit(1000);

  if (error) {
    console.error('Error fetching series:', error.message);
    return;
  }

  const rows = [['series_id', 'title', 'stored_chapters', 'min_ch', 'max_ch', 'source_platform', 'target_url']];

  for (const s of series) {
    const chs = (s.chapters || []).map(c => Number(c.chapter_number)).sort((a, b) => a - b);
    rows.push([
      s.id,
      `"${s.title.replace(/"/g, '""')}"`,
      chs.length,
      chs[0] || 0,
      chs[chs.length - 1] || 0,
      `"${s.series_intel?.[0]?.source_platform || 'none'}"`,
      `"${s.series_intel?.[0]?.target_url || 'none'}"`
    ]);
  }

  fs.writeFileSync('full_471_catalog.csv', rows.map(r => r.join(',')).join('\n'));
  console.log(`Saved all ${series.length} series to full_471_catalog.csv`);
}

exportCatalog();
