import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type ThemeSectionProps = {
  theme?: string;
  setTheme: (value: string) => void;
};

export function ThemeSection({ theme, setTheme }: ThemeSectionProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Theme Preferences</h2>
          <p className="text-sm text-muted-foreground">
            Choose how the interface adapts to light and dark mode.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline">
            Light
          </Button>
          <Button type="button" variant="outline">
            Dark
          </Button>
          <Button type="button" variant="outline">
            System
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Theme Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Choose how the interface adapts to light and dark mode.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={theme === "light" ? "default" : "outline"}
          onClick={() => setTheme("light")}
        >
          Light
        </Button>
        <Button
          type="button"
          variant={theme === "dark" ? "default" : "outline"}
          onClick={() => setTheme("dark")}
        >
          Dark
        </Button>
        <Button
          type="button"
          variant={theme === "system" ? "default" : "outline"}
          onClick={() => setTheme("system")}
        >
          System
        </Button>
      </div>
    </section>
  );
}
