import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// Poppins en 400/600/700 (cf. charte). Repli automatique sur la pile système via --font-sans.
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

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
    <html lang="fr" className={`h-full antialiased ${poppins.variable}`}>
      <body className="min-h-full flex flex-col bg-page text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
