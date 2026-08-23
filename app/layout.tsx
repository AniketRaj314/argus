import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const rawHost = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = /^[a-z0-9.-]+(?::\d+)?$/i.test(rawHost) ? rawHost : "localhost:3000";
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const protocol = forwardedProto === "https" || (!forwardedProto && !host.startsWith("localhost")) ? "https" : "http";
  const origin = `${protocol}://${host}`;
  const description = "Secure, assignment-scoped OpenAI API usage intelligence.";
  return {
    metadataBase: new URL(origin),
    title: { default: "ARGUS — API usage intelligence", template: "%s · ARGUS" },
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      title: "ARGUS — API usage intelligence",
      description,
      images: [{ url: `${origin}/og.png`, width: 1672, height: 941, alt: "ARGUS API usage intelligence dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ARGUS — API usage intelligence",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

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
