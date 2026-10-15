import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SUTRA — Anonymous classroom intelligence",
    template: "%s — SUTRA",
  },
  description:
    "SUTRA connects anonymous student questions, recurring confusion, and actionable teaching insights into one classroom feedback loop.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/favicon.png",
  },
  openGraph: {
    siteName: "SUTRA",
    type: "website",
    title: "SUTRA — Anonymous classroom intelligence",
    description:
      "Help teachers discover what students don't understand — without asking anyone to speak up.",
  },
  twitter: {
    card: "summary",
    title: "SUTRA — Anonymous classroom intelligence",
    description:
      "Anonymous student doubts, intelligently grouped. Teachers see what matters most.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-dvh flex flex-col bg-paper text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
