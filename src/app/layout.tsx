import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { I18nProvider } from "@/lib/i18n";

// Handwriting signature fonts are bundled locally (no CDN) so that the
// signature a signer sees is exactly the signature that gets affixed.
import "@fontsource/caveat/400.css";
import "@fontsource/caveat/600.css";
import "@fontsource/dancing-script/500.css";
import "@fontsource/great-vibes/400.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // The canonical public origin: OG images and relative canonicals resolve here.
  metadataBase: new URL("https://docurama.eu"),
  title: "Docurama: Enterprise Portal and Admin Console",
  description:
    "Docurama platform console by VOIRIA SASU (Docurama is a product of VOIRIA, Paris, France): document signing, PAdES cryptographic verification, tenant administration, compliance operations and trust analytics.",
  // Favicon (app/icon.svg) and touch icon (app/apple-icon.png) are resolved
  // automatically from the app directory by the Next.js file conventions.
  openGraph: {
    title: "Docurama: Sign, Seal, Verify",
    description:
      "The enterprise portal for signed, sealed and verifiable documents. Docurama is a product of VOIRIA (VOIRIA SASU, 1 Rue Marguerin, 75014 Paris, France).",
    siteName: "Docurama",
    images: ["/brand/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Docurama: Sign, Seal, Verify",
    description:
      "The enterprise portal for signed, sealed and verifiable documents.",
    images: ["/brand/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <I18nProvider>
            {children}
            <Toaster position="bottom-right" richColors closeButton />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
