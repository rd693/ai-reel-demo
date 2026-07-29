import "./globals.css";
import React from "react";
import { Inter, DM_Sans } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata = {
  title: "AI Reel Studio",
  description: "Internal SaaS for generating video reels",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${dmSans.variable} bg-slate-50 text-slate-900 min-h-screen font-sans`}>
        {children}
      </body>
    </html>
  );
}
