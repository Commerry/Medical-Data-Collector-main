"use client";

import { Computer, Laptop, Laptop2, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button aria-label="Toggle theme" variant="ghost" size="icon" type="button" />
    );
  }

  const isDark = theme === "dark";

const cycleTheme = () => {
    if (theme === "light") {
        setTheme("dark");
    } else if (theme === "dark") {
        setTheme("system");
    } else {
        setTheme("light");
    }
};

const iconTheme = () => {
    if (theme === "light") {
        return <Sun className="h-4 w-4" />;
    }
    if (theme === "dark") {
        return <Moon className="h-4 w-4" />;
    }
    if (theme === "system") {
        return <Laptop2 className="h-4 w-4" />;
    }
    return <Sun className="h-4 w-4" />;
};

return (
    <Button
        aria-label="Toggle theme"
        variant="ghost"
        size="icon"
        type="button"
        onClick={cycleTheme}
    >
        {iconTheme()}
    </Button>
);
}
