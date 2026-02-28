import "./globals.css";

import Link from "next/link";

import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Medical Data Collector",
  description: "Medical Data Collection Dashboard"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                    {/* Medical icon placeholder */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                      <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/>
                      <path d="m18 15-2-2"/>
                      <path d="m15 18-2-2"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Medical Data Collector</div>
                    <div className="text-xs text-muted-foreground">
                      Real-time medical sync dashboard
                    </div>
                  </div>
                </div>
                <nav className="flex items-center gap-2">
                  <Link
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    href="/"
                  >
                    Dashboard
                  </Link>
                  <Link
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    href="/history"
                  >
                    History
                  </Link>
                  <Link
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    href="/settings"
                  >
                    Settings
                  </Link>
                  <ThemeToggle />
                </nav>
              </div>
            </header>
            <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
