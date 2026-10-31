import { adminSession } from "@/lib/developer/auth";
import { notFound, redirect } from "next/navigation";
import { DeveloperDashboard } from "@/components/developer-dashboard";
export const dynamic = "force-dynamic";
export default async function DeveloperPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  try {
    await adminSession();
  } catch {
    redirect("/settings");
  }
  return <DeveloperDashboard />;
}
