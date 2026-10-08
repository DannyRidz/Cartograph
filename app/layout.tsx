import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { themeScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cartograph",
  description: "A dependency map drawn from your repository's code.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="system"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/workspace"
          signUpForceRedirectUrl="/workspace"
          appearance={{
            variables: {
              colorPrimary: "var(--accent)",
              colorPrimaryForeground: "var(--on-accent)",
              colorBackground: "var(--surface)",
              colorForeground: "var(--foreground)",
              colorNeutral: "var(--foreground)",
              colorMuted: "var(--background)",
              colorMutedForeground: "var(--muted)",
              colorInput: "var(--surface)",
              colorInputForeground: "var(--foreground)",
              colorBorder: "var(--border)",
              fontFamily: "var(--font-geist-sans), sans-serif",
              fontSize: "13px",
              borderRadius: "3px",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
