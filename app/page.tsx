import { Workbench } from "@/app/workbench";
import { newsletterIntegrationMode, workbenchService } from "@/src/workbench/runtime";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ fetchError?: string | string[] }>;
}) {
  const params = await searchParams;
  const fetchError = params.fetchError;
  const fetchFailed =
    fetchError === "catalog" || (Array.isArray(fetchError) && fetchError.includes("catalog"));

  return (
    <Workbench
      state={await workbenchService.load()}
      integrationMode={newsletterIntegrationMode}
      fetchFailed={fetchFailed}
    />
  );
}
