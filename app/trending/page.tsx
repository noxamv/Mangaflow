import CategoryCatalogPage from '../components/CategoryCatalogPage';

export default function TrendingPage() {
  return (
    <CategoryCatalogPage
      title="Trending Series"
      description="Most read manga and manhwa this week"
      sortQuery="trending"
    />
  );
}
