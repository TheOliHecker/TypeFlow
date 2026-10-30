import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
export const metadata: Metadata = { title: "Your workspace" };
export default function WorkspacePage() { return <Workspace />; }
