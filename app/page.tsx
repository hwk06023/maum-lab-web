import { getCatalog } from '@/lib/catalog';
import MaumApp from './_components/MaumApp';

// ISR: the catalogue is public and shared, so the home page is served from the
// CDN and refreshed in the background when personas change on the server.
export const revalidate = 60;

export default async function Page() {
  const catalog = await getCatalog();
  return <MaumApp initialCatalog={catalog} />;
}
