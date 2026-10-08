import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cartograph",
  description: "A dependency map drawn from your repository's code.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 font-sans text-sm dark:border-zinc-800 dark:bg-zinc-950">
            <Link
              href="/"
              className="font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
            >
              Cartograph
            </Link>
            <nav aria-label="Account" className="flex items-center gap-2">
              <Suspense fallback={null}>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-sm px-3 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:hover:bg-zinc-800"
                    >
                      Sign in
                    </button>
                  </SignInButton>
                  <SignUpButton mode="modal">
                    <button
                      type="button"
                      className="h-8 cursor-pointer rounded-sm bg-blue-600 px-3 text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Sign up
                    </button>
                  </SignUpButton>
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </Suspense>
            </nav>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
