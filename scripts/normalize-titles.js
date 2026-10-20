import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function cleanTitle(str) {
  if (!str) return '';
  return str
    .replace(/[【】\[\]\(\)\{\}★☆～~:!?:_]/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function runMetadataPass() {
  console.log('Fetching series requiring metadata enhancement...');
  const { data: allSeries } = await supabase
    .from('series')
    .select('id, title, slug, english_title, native_title, synonyms')
    .limit(500);

  if (!allSeries?.length) return;

  for (const s of allSeries) {
    const query = cleanTitle(s.english_title || s.title);
    try {
      const res = await fetch(`https://api.comick.io/v1.0/search?q=${encodeURIComponent(query)}&limit=1`);
      if (!res.ok) continue;
      const results = await res.json();
      const meta = results?.[0];

      if (meta) {
        const english = meta.title || s.english_title;
        const synonymsList = Array.isArray(meta.md_titles) ? meta.md_titles.map(t => t.title) : [];

        await supabase
          .from('series')
          .update({
            english_title: english,
            synonyms: synonymsList.length > 0 ? synonymsList : s.synonyms,
            updated_at: new Date().toISOString()
          })
          .eq('id', s.id);

        console.log(`Updated: "${s.title}" -> English: "${english}"`);
      }
    } catch (err) {
      console.error(`Failed on "${s.title}":`, err.message);
    }
  }
  console.log('Metadata pass complete.');
}

runMetadataPass();
