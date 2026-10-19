import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CompliBot - AI Security Questionnaire Responder",
  description:
    "Upload any vendor security questionnaire, get 90%+ accurate AI-generated answers in minutes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Toaster position="top-right" richColors />
          {children}
        </Providers>
      </body>
    </html>
  );
}
