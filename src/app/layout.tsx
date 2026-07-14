import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Navette : campagne budgétaire",
  description:
    "Portail de campagne budgétaire : navettes par département, consolidation en P&L mensuel, alertes de gestion.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
