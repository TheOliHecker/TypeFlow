import { adminSession } from "@/lib/developer/auth";
import { redirect } from "next/navigation";
import { DeveloperDashboard } from "@/components/developer-dashboard";
export const dynamic = "force-dynamic";
export default async function DeveloperPage() {
  try {
    await adminSession();
  } catch {
    redirect("/settings");
  }
  return <DeveloperDashboard />;
}
