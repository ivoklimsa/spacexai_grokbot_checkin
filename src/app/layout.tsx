import type { Metadata } from "next";
import { Sora, Syne } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-body",
  subsets: ["latin"],
});

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpaceXAi Check-in",
  description: "Fullscreen floating grokbot arrivals board for SpaceXAi event check-ins.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${syne.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-hidden bg-[#07090f] font-[family-name:var(--font-body)] text-white">
        {children}
      </body>
    </html>
  );
}
