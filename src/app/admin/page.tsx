import type { Metadata } from "next";
import { AdminBoard } from "@/components/AdminBoard";

export const metadata: Metadata = {
  title: "Check-ins",
};

export default function AdminPage() {
  return <AdminBoard />;
}
