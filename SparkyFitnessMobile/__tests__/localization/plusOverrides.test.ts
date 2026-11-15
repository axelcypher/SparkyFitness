import type { i18n as I18n } from 'i18next';

import en from '../../src/localization/locales/en/translation.json';
import de from '../../src/localization/locales/de/translation.json';
import deOverrides from '../../src/localization/plus/de.json';

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

type Catalog = { [key: string]: string | Catalog };

// Imported outside the isolated module registry, so these stay the pristine
// catalogs even though i18next merges the overrides into its own copy.
const enCatalog = en as Catalog;
const deCatalog = de as Catalog;

function flatten(catalog: Catalog, prefix = ''): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? [[path, value] as [string, string]]
      : flatten(value, path);
  });
}

function lookup(catalog: Catalog, path: string): string | Catalog | undefined {
  return path
    .split('.')
    .reduce<string | Catalog | undefined>(
      (node, key) => (typeof node === 'object' ? node[key] : undefined),
      catalog
    );
}

const overriddenKeys = flatten(deOverrides as Catalog);

async function withI18n(
  language: 'de' | 'en',
  run: (i18n: I18n) => Promise<void> | void
): Promise<void> {
  await jest.isolateModulesAsync(async () => {
    const {
      default: i18n,
      initializeI18n,
    } = require('../../src/localization/i18n');
    await initializeI18n(language);
    await run(i18n);
  });
}

describe('plus German i18n overrides', () => {
  it('overrides at least one key', () => {
    expect(overriddenKeys.length).toBeGreaterThan(0);
  });

  it('only overrides keys that exist in the German and English catalogs', () => {
    for (const [key] of overriddenKeys) {
      // Fork-only strings (`plus.*`) live in the English catalog alone; the
      // synced German catalog never has them, so the override is their text.
      if (!key.startsWith('plus.')) {
        expect(typeof lookup(deCatalog, key)).toBe('string');
      }
      expect(typeof lookup(enCatalog, key)).toBe('string');
    }
  });

  it('wins over the bundled German catalog', async () => {
    await withI18n('de', (i18n) => {
      for (const [key, value] of overriddenKeys) {
        expect(i18n.t(key)).toBe(value);
      }
      expect(i18n.t('navigation.exercises')).toBe('Aktivitäten');
      expect(i18n.t('workoutDetail.summary.exercise', { count: 3 })).toBe(
        'Aktivitäten'
      );
    });
  });

  it('keeps every other German key, including siblings of overridden keys', async () => {
    await withI18n('de', (i18n) => {
      const overridden = new Set(overriddenKeys.map(([key]) => key));
      const untouched = flatten(deCatalog).filter(
        ([key]) => !overridden.has(key)
      );

      expect(untouched.length).toBeGreaterThan(overridden.size);
      for (const [key, value] of untouched) {
        expect(i18n.getResource('de', 'translation', key)).toBe(value);
      }
      expect(i18n.t('exerciseSearch.filter.mine')).toBe(
        lookup(deCatalog, 'exerciseSearch.filter.mine')
      );
    });
  });

  it('leaves English untouched', async () => {
    await withI18n('en', (i18n) => {
      for (const [key] of overriddenKeys) {
        expect(i18n.t(key)).toBe(lookup(enCatalog, key));
      }
    });
  });

  it('applies after switching from English to German', async () => {
    await withI18n('en', async (i18n) => {
      await i18n.changeLanguage('de');

      expect(i18n.t('navigation.exercises')).toBe('Aktivitäten');
      expect(i18n.t('screens.library.exercises')).toBe('Aktivitäten');
    });
  });
});
