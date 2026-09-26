import fa from "./dictionaries/fa";
import en from "./dictionaries/en";
import { type Locale, defaultLocale, isLocale } from "./config";

export type Dictionary = typeof fa;

const dictionaries: Record<Locale, Dictionary> = { fa, en: en as Dictionary };

export function getDictionary(locale: string): Dictionary {
  return dictionaries[isLocale(locale) ? locale : defaultLocale];
}

export * from "./config";
