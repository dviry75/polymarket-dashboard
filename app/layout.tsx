import type { Metadata } from "next";
import "./globals.css";



export const metadata: Metadata = {
  title: "Polymarket Robot | מרכז שליטה",
  description: "מרכז שליטה חזותי למערכת המסחר האוטומטית",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/live-status/favicon.svg",
    shortcut: "/live-status/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
