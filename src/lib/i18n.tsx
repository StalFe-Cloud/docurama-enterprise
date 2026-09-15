"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import enMessages from "../../messages/en.json";
import frMessages from "../../messages/fr.json";

export type Locale = "en" | "fr";

const dictionaries: Record<Locale, any> = {
  en: enMessages,
  fr: frMessages,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string, fallback?: string) => string;
  formatDate: (d: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: "en",
  setLocale: () => {},
  t: (_path, fallback) => fallback || "",
  formatDate: (d) => String(d),
});

function getInitialLocale(): Locale {
  if (typeof document === "undefined") return "en";
  try {
    const cookies = document.cookie.split(";");
    const locCookie = cookies.find((c) => c.trim().startsWith("NEXT_LOCALE="));
    if (locCookie) {
      const val = locCookie.split("=")[1]?.trim().toLowerCase();
      if (val === "fr" || val === "en") return val as Locale;
    }

    const params = new URLSearchParams(window.location.search);
    const langParam = params.get("lang")?.toLowerCase();
    if (langParam === "fr" || langParam === "en") return langParam as Locale;

    if (navigator.language.startsWith("fr")) return "fr";
  } catch {
    // ignore server or restricted environment errors
  }
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    document.documentElement.lang = newLocale;
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;SameSite=Lax`;
  };

  const t = (path: string, fallback?: string): string => {
    const dict = dictionaries[locale] || dictionaries.en;
    const parts = path.split(".");
    let current: any = dict;

    for (const part of parts) {
      if (current && typeof current === "object" && part in current) {
        current = current[part];
      } else {
        // Fallback to English dict if available
        let fb: any = dictionaries.en;
        for (const p of parts) {
          if (fb && typeof fb === "object" && p in fb) {
            fb = fb[p];
          } else {
            return fallback || path;
          }
        }
        return typeof fb === "string" ? fb : fallback || path;
      }
    }

    return typeof current === "string" ? current : fallback || path;
  };

  const formatDate = (d: Date | string | number, options?: Intl.DateTimeFormatOptions) => {
    const dateObj = d instanceof Date ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    const locTag = locale === "fr" ? "fr-FR" : "en-GB";
    return new Intl.DateTimeFormat(
      locTag,
      options || { day: "numeric", month: "short", year: "numeric" }
    ).format(dateObj);
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, formatDate }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
