import type { i18n as I18n } from 'i18next';
import deOverrides from './i18nOverrides.de.json';

/**
 * Fork-only translation overrides (sparkyfitness-plus).
 *
 * The locale catalogs in `public/locales/` are replaced from Weblate by
 * upstream's sync workflow, so the fork keeps its wording changes here and
 * merges them in at runtime instead of editing the synced files.
 */
const NAMESPACE = 'translation';
const OVERRIDES: Record<string, object> = { de: deOverrides };

function applyOverrides(i18n: I18n): void {
  for (const [language, overrides] of Object.entries(OVERRIDES)) {
    if (!i18n.hasResourceBundle(language, NAMESPACE)) continue;
    // deep + overwrite: only the listed keys change, their siblings stay.
    i18n.addResourceBundle(language, NAMESPACE, overrides, true, true);
  }
}

/**
 * Keeps the overrides on top of the loaded catalogs. Call it right after
 * `i18n.init()`.
 *
 * The HTTP backend answers after init and shallow-merges each catalog into the
 * store, which replaces whole objects such as `exercise`. Merging once up front
 * would therefore be lost, so the overrides are merged again every time the
 * backend reports a load (first load, language switch, reload).
 */
export function installPlusI18nOverrides(i18n: I18n): void {
  i18n.on('loaded', () => applyOverrides(i18n));
  applyOverrides(i18n);
}
