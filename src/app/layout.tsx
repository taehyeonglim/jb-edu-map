import type { Metadata } from "next";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { Noto_Sans_KR } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://jb-edu-map.vercel.app";
const siteTitle = `${ACTIVE_PROFILE.province.shortName}교육지도`;
const siteDescription = `${ACTIVE_PROFILE.province.shortName}의 학교와 교육 현황을 지도에서 살펴보세요. 시군별 통계와 교육문제를 함께 비교할 수 있습니다.`;
const socialImage = {
  url: "/social-preview-v2.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${siteTitle} — 학교 · 통계 · 교육문제를 살펴보는 교육 데이터 지도`,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [socialImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={notoSansKr.variable}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
