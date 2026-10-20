import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { ThemedToaster } from "@/components/ThemedToaster";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CompliBot",
  description:
    "Self-hosted assistant that drafts answers to vendor security questionnaires from your own knowledge base.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme before first paint (no light/dark flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <Providers>
          <ThemedToaster />
          {children}
        </Providers>
      </body>
    </html>
  );
}
