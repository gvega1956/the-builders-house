import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TRPCProviders } from "@/components/shared/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The Builder's House · ERP",
  description: "Sistema ERP para The Builder's House · Puerto Rico",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ background: 'transparent' }}
    >
      <body className="h-full">
        <TRPCProviders>{children}</TRPCProviders>
      </body>
    </html>
  );
}
