import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description = "Secure, assignment-scoped OpenAI API usage intelligence.";
const metadataOrigin = process.env.ARGUS_APP_ORIGIN ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(metadataOrigin),
  title: { default: "ARGUS: API usage intelligence", template: "%s · ARGUS" },
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    title: "ARGUS: API usage intelligence",
    description,
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "ARGUS API usage intelligence dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ARGUS: API usage intelligence",
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
