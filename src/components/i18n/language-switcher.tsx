"use client";

import React from "react";
import { useI18n, type Locale } from "@/lib/i18n";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher({
  variant = "ghost",
  size = "sm",
  showLabel = true,
}: {
  variant?: "ghost" | "outline" | "default";
  size?: "sm" | "default" | "icon";
  showLabel?: boolean;
}) {
  const { locale, setLocale } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className="inline-flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          aria-label="Select language"
        >
          <Globe className="h-3.5 w-3.5" />
          {showLabel && (
            <span>{locale === "fr" ? "FR" : "EN"}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36 text-xs">
        <DropdownMenuItem
          onClick={() => setLocale("en")}
          className={`cursor-pointer justify-between ${locale === "en" ? "font-semibold text-primary" : ""}`}
        >
          <span>🇬🇧 English</span>
          {locale === "en" && <span className="text-[10px]">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLocale("fr")}
          className={`cursor-pointer justify-between ${locale === "fr" ? "font-semibold text-primary" : ""}`}
        >
          <span>🇫🇷 Français</span>
          {locale === "fr" && <span className="text-[10px]">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
