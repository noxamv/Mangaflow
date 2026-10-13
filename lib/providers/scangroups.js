const axios = require('axios');

const MD_API = axios.create({
  baseURL: 'https://api.mangadex.org',
  timeout: 10000,
  headers: { 'User-Agent': 'MangaFlowCollector/1.0' }
});

// Well-known group UUIDs on MangaDex
const GROUP_UUIDS = {
  asura: 'b287ff1c-e547-41ec-b755-be2368aee462', // Asura Scans
  temple: '72e5a7b6-17b9-4c81-807f-e0c1f6b21be3', // Temple Scans
};

async function getScanGroupChapters(mangaUuid, groupKey) {
  const groupId = GROUP_UUIDS[groupKey];
  if (!groupId) return [];

  try {
    const res = await MD_API.get(`/manga/${mangaUuid}/feed`, {
      params: {
        translatedLanguage: ['en'],
        groups: [groupId],
        limit: 100
      }
    });

    const items = res.data?.data || [];
    return items.map(ch => ({
      chapter_number: parseFloat(ch.attributes?.chapter) || 0,
      title: ch.attributes?.title || `Chapter ${ch.attributes?.chapter}`,
      source_provider: groupKey,
      source: ch.id
    }));
  } catch {
    return [];
  }
}

module.exports = { getScanGroupChapters };
