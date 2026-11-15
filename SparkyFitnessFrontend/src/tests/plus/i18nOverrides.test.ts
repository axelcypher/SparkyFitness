import { createInstance, type BackendModule, type i18n as I18n } from 'i18next';
import en from '../../../public/locales/en/translation.json';
import de from '../../../public/locales/de/translation.json';
import deOverrides from '@/plus/i18nOverrides.de.json';
import { installPlusI18nOverrides } from '@/plus/i18nOverrides';

type Catalog = { [key: string]: string | Catalog };

const enCatalog = en as Catalog;
const deCatalog = de as Catalog;
const catalogs: Record<string, Catalog> = {
  en: enCatalog,
  de: deCatalog,
};

// Stands in for i18next-http-backend: it answers asynchronously and the
// connector shallow-merges the answer into the store, exactly like the real
// backend does after the HTTP fetch.
const asyncBackend: BackendModule = {
  type: 'backend',
  init: () => undefined,
  read: (language, _namespace, callback) => {
    setTimeout(() => {
      // Hand out a copy so a reload starts from the pristine catalog.
      callback(null, JSON.parse(JSON.stringify(catalogs[language] ?? {})));
    }, 0);
  },
};

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

async function createI18n(language: string): Promise<I18n> {
  const instance = createInstance();
  instance.use(asyncBackend);
  const initialized = instance.init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'de'],
    interpolation: { escapeValue: false },
  });
  // Same order as src/i18n.ts: the hook is installed right after init().
  installPlusI18nOverrides(instance);
  await initialized;
  return instance;
}

describe('plus German i18n overrides', () => {
  it('overrides at least one key', () => {
    expect(overriddenKeys.length).toBeGreaterThan(0);
  });

  it('only overrides keys that exist in the German and English catalogs', () => {
    for (const [key] of overriddenKeys) {
      expect(typeof lookup(deCatalog, key)).toBe('string');
      expect(typeof lookup(enCatalog, key)).toBe('string');
    }
  });

  it('wins over the German values the backend loaded', async () => {
    const i18n = await createI18n('de');

    for (const [key, value] of overriddenKeys) {
      expect(i18n.t(key)).toBe(value);
    }
    expect(i18n.t('exercise.databaseManager.cardTitle')).toBe('Aktivitäten');
    expect(i18n.t('exercise.addExerciseDialog.myExercisesTab')).toBe(
      'Meine Aktivitäten'
    );
  });

  it('keeps every other German key, including siblings of overridden keys', async () => {
    const i18n = await createI18n('de');
    const overridden = new Set(overriddenKeys.map(([key]) => key));

    expect(i18n.t('exercise.title')).toBe('Training');
    const untouched = flatten(deCatalog).filter(
      ([key]) => !overridden.has(key)
    );
    expect(untouched.length).toBeGreaterThan(overridden.size);
    for (const [key, value] of untouched) {
      expect(i18n.getResource('de', 'translation', key)).toBe(value);
    }
  });

  it('leaves English untouched', async () => {
    const i18n = await createI18n('en');
    await i18n.loadLanguages('de');

    for (const [key] of overriddenKeys) {
      expect(i18n.t(key, { lng: 'en' })).toBe(lookup(enCatalog, key));
    }
    expect(i18n.t('exercise.databaseManager.cardTitle', { lng: 'de' })).toBe(
      'Aktivitäten'
    );
  });

  it('applies again when the backend reloads the German catalog', async () => {
    const i18n = await createI18n('de');

    await i18n.reloadResources('de');

    expect(i18n.t('exercise.databaseManager.cardTitle')).toBe('Aktivitäten');
    expect(i18n.t('exercise.title')).toBe('Training');
  });

  it('applies to a German catalog that loaded before the hook was installed', async () => {
    const instance = createInstance();
    instance.use(asyncBackend);
    await instance.init({ lng: 'de', fallbackLng: 'en' });

    installPlusI18nOverrides(instance);

    expect(instance.t('exercise.databaseManager.cardTitle')).toBe(
      'Aktivitäten'
    );
  });
});
