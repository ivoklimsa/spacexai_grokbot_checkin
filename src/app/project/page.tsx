import type { Metadata } from "next";
import { ProjectBoard } from "@/components/ProjectBoard";

export const metadata: Metadata = {
  title: "Projects",
};

export default function ProjectPage() {
  return <ProjectBoard />;
}
