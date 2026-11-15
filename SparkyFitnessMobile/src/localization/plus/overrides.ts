import type { i18n as I18n } from 'i18next';

import deOverrides from './de.json';

/**
 * Fork-only translation overrides (sparkyfitness-plus).
 *
 * The catalogs in `../locales/` are replaced from Weblate by upstream's sync
 * workflow, and `generatedLocaleResources.ts` is generated, so the fork keeps
 * its wording changes here and merges them in after `init`.
 */
const NAMESPACE = 'translation';
const OVERRIDES: Record<string, object> = { de: deOverrides };

/** Merges the overrides into the bundled catalogs. Call it after `init`. */
export function applyPlusI18nOverrides(i18n: I18n): void {
  for (const [language, overrides] of Object.entries(OVERRIDES)) {
    if (!i18n.hasResourceBundle(language, NAMESPACE)) continue;
    // deep + overwrite: only the listed keys change, their siblings stay.
    i18n.addResourceBundle(language, NAMESPACE, overrides, true, true);
  }
}
