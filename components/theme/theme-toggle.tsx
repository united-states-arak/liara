"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "theme";

function apply(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Starts from the saved choice, or the system preference when nothing is saved. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    setTheme(
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
    );
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} title={label}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
