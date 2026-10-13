const axios = require('axios');

const client = axios.create({
  baseURL: 'https://jumpg-webapi.tokyo-cdn.com/api',
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

async function getMangaPlusChapters(titleSlug) {
  try {
    // MangaPlus uses specific title IDs; query their featured/all list to match title
    const res = await client.get('/title_list/allV2');
    const allTitles = res.data?.success?.allTitlesViewV2?.allTitlesGroup || [];
    
    let matchedId = null;
    for (const group of allTitles) {
      const match = group.titles?.find(t => 
        t.name.toLowerCase().includes(titleSlug.toLowerCase())
      );
      if (match) {
        matchedId = match.titleId;
        break;
      }
    }

    if (!matchedId) return [];

    const detailRes = await client.get(`/title_detailV3?title_id=${matchedId}`);
    const chapterList = detailRes.data?.success?.titleDetailView?.firstTitleList || [];
    const latestList = detailRes.data?.success?.titleDetailView?.lastTitleList || [];
    const all = [...chapterList, ...latestList];

    return all.map(ch => ({
      chapter_number: parseFloat(ch.name.replace(/[^0-9.]/g, '')) || 0,
      title: ch.subTitle || ch.name,
      source_provider: 'mangaplus',
      source: `mangaplus_${ch.chapterId}`
    }));
  } catch (err) {
    return [];
  }
}

module.exports = { getMangaPlusChapters };
