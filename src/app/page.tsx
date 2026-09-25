import { Suspense } from "react";
import { Kiosk } from "@/components/Kiosk";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex h-dvh w-dvw items-center justify-center bg-[#07090f] text-white/50">
          Loading stage…
        </main>
      }
    >
      <Kiosk />
    </Suspense>
  );
}
