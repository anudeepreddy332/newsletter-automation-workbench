import { Workbench } from "@/app/workbench";
import { workbenchService } from "@/src/workbench/runtime";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <Workbench state={await workbenchService.load()} />;
}
