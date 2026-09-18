"use client";
import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, type Theme } from "@/lib/theme";
import { useLocalPref } from "@/lib/hooks/useLocalPref";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** cycles system, light, dark. one button, one icon, the label in the tooltip */
const ORDER: Theme[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;
const LABEL = { system: "theme: follows your system", light: "theme: light", dark: "theme: dark" } as const;
const SHORT = { system: "auto", light: "light", dark: "dark" } as const;

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useLocalPref<Theme>("theme", "system");

  useEffect(() => applyTheme(theme), [theme]);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = ICON[theme];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary" size="md" aria-label={`${LABEL[theme]}. switch to ${next}`} onClick={() => setTheme(next)} className={className}>
          <Icon />
          <span className="text-ink-2">{SHORT[theme]}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{LABEL[theme]}</TooltipContent>
    </Tooltip>
  );
}
