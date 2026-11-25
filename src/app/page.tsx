import DashboardClient from "@/components/DashboardClient";
import { buildDashboardPayload } from "@/lib/analytics";
import { getAllReviews, getProperties, getStorageMode, getSyncRuns } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [properties, reviews, syncRuns] = await Promise.all([
    getProperties(),
    getAllReviews(),
    getSyncRuns(),
  ]);

  const initialData = buildDashboardPayload(
    properties,
    reviews,
    syncRuns,
    getStorageMode(),
    {}
  );

  return <DashboardClient initialData={initialData} />;
}
