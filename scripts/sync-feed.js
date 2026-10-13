        // Fetch up to 300 English chapters per series (pages of 100)
        let allChapters = [];
        for (let chOffset = 0; chOffset < 300; chOffset += 100) {
          const { data: feed } = await api.get(`/manga/${mangaId}/feed`, {
            params: {
              limit: 100,
              offset: chOffset,
              'translatedLanguage[]': ['en'],
              'order[chapter]': 'asc',
              includeEmptyPages: 0
            }
          });

          const batch = feed.data || [];
          allChapters.push(...batch);

          // Stop if we received fewer than 100 (reached the end of chapters)
          if (batch.length < 100) break;
          await sleep(200);
        }

        const chapterRows = [];
        const seenChapters = new Set();

        for (const ch of allChapters) {
          const rawNum = ch.attributes.chapter;
          const chNumber = rawNum ? parseFloat(rawNum) : null;

          if (chNumber === null || isNaN(chNumber)) continue;
          if (seenChapters.has(chNumber)) continue;
          seenChapters.add(chNumber);

          chapterRows.push({
            series_id: seriesRow.id,
            chapter_number: chNumber,
            title: ch.attributes.title || `Chapter ${chNumber}`,
            source: ch.id,
            panel_urls: []
          });
        }

        if (chapterRows.length > 0) {
          await supabase.from('chapters').upsert(chapterRows, {
            onConflict: 'series_id, chapter_number'
          });
          console.log(`   └─ Indexed ${chapterRows.length} total chapters.`);
        }
