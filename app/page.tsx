// 16:9 Spotlight Slider with Official Poster Embedded (3.0s Auto Rotation)
function SpotlightSlider({ items }: { items: SeriesItem[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 3000); // Updated to 3.0 seconds
    return () => clearInterval(interval);
  }, [items.length]);

  if (!items || items.length === 0) return null;
  const current = items[index];

  return (
    <div className="relative w-full aspect-[16/9] max-h-[280px] sm:max-h-[340px] rounded-2xl overflow-hidden border border-neutral-800/80 bg-neutral-950 shadow-xl group">
      {/* Blurred ambient background */}
      {current.cover_image_url && (
        <div
          className="absolute inset-0 bg-cover bg-center filter blur-xl scale-110 opacity-25 transition-all duration-700"
          style={{ backgroundImage: `url(${current.cover_image_url})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-black via-black/85 to-black/30 z-10" />

      {/* Main card body with Official Cover Poster */}
      <div className="relative z-20 w-full h-full p-4 sm:p-6 flex items-center justify-between gap-4">
        
        {/* Left: Text & Read button */}
        <div className="max-w-[65%] sm:max-w-md space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-300 border border-indigo-500/40">
              Spotlight #{index + 1}
            </span>
            <span className="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-black/60 text-neutral-300 border border-white/10">
              {current.reading_mode === 'webtoon' ? 'Manhwa' : 'Manga'}
            </span>
          </div>

          <h2 className="text-sm sm:text-lg font-black text-white line-clamp-1">
            {current.title}
          </h2>

          <p className="text-[10px] sm:text-xs text-neutral-400 line-clamp-2">
            {current.synopsis || 'Read online for free on MangaFlow.'}
          </p>

          <div className="pt-1">
            <Link
              href={`/series/${current.slug}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-md transition"
            >
              Read Now →
            </Link>
          </div>
        </div>

        {/* Right: Official Series Poster Image */}
        <div className="shrink-0 w-24 sm:w-32 aspect-[3/4.2] rounded-xl overflow-hidden border border-white/15 shadow-2xl bg-neutral-900">
          {current.cover_image_url ? (
            <img
              src={current.cover_image_url}
              alt={current.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-neutral-600">No Image</div>
          )}
        </div>
      </div>

      {/* Indicators */}
      <div className="absolute bottom-2 left-4 z-30 flex gap-1">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-4 bg-indigo-500' : 'w-1.5 bg-neutral-600'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
