import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans, DM_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import SiteNav, { PostingAs } from "@/components/SiteNav";
import ConvexClientProvider from "@/components/ConvexClientProvider";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const body = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Solo Queue",
  description:
    "Personal publishing engine — research once, stay weeks ahead on Threads and Instagram.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <ConvexClientProvider>
          <div className="sq-shell">
            <aside className="sq-sidebar">
              <Link href="/" className="sq-logo">
                solo queue<span className="sq-logo-dot" aria-hidden="true" />
              </Link>
              <SiteNav />
              <PostingAs />
            </aside>
            <main className="sq-main">
              <div className="sq-panel">{children}</div>
            </main>
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
