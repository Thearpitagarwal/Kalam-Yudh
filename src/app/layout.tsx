import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Baloo_2, Caveat, Hind } from "next/font/google";
import "./globals.css";

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-caveat",
  display: "swap",
});

const hind = Hind({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hind",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pen Fight — Class 10-B",
  description:
    "The classic Indian school pen-fighting game, in 3D. Flick pens across the classroom desk, knock your rival's pen off, and climb the chalkboard legends. Play vs computer, pass & play, or online.",
};

export const viewport: Viewport = {
  themeColor: "#173a2d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${baloo.variable} ${caveat.variable} ${hind.variable}`}>
      <body className="bg-[#1a3a2d] text-[#f6f2e4] antialiased">{children}</body>
    </html>
  );
}
