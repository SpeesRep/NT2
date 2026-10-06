import { getMeta, setMeta } from './db';

// The learner's own settings ("Instellingen"). PHONE ONLY: stored in IndexedDB meta.userSettings, never sent to
// the Sheet or any server (they leave the phone only in her own JSON backup). null = use the default.
export type UserSettings = { newPerDay: number | null; listeningEnabled: boolean | null; readAnswer: boolean | null };

export const EMPTY_USER_SETTINGS: UserSettings = { newPerDay: null, listeningEnabled: null, readAnswer: null };

/** The choices for "Max. aantal nieuwe woorden per dag". */
export const NEW_PER_DAY_OPTIONS = [5, 10, 15, 20];

/** One row of the Instellingen page (more can be added later). */
export type SettingRow = { key: keyof UserSettings; label: string; type: 'select' | 'toggle' };
export const SETTING_ROWS: SettingRow[] = [
  { key: 'newPerDay', label: 'settings.newPerDay', type: 'select' },
  { key: 'listeningEnabled', label: 'settings.listening', type: 'toggle' },
  { key: 'readAnswer', label: 'settings.readAnswer', type: 'toggle' }
];

/**
 * Dropdown entries for new cards per day. When the Sheet default is not one of the options, a "Standaard (X)"
 * entry (value null) is added, so the control never shows something false. `selected` = the effective choice.
 */
export function newPerDayChoices(sheetValue: number, user: UserSettings): { options: { value: number | null; n: number; isDefault: boolean }[]; selected: number | null } {
  const options: { value: number | null; n: number; isDefault: boolean }[] = NEW_PER_DAY_OPTIONS.map((n) => ({ value: n, n, isDefault: false }));
  const sheetListed = NEW_PER_DAY_OPTIONS.includes(sheetValue);
  if (!sheetListed) options.unshift({ value: null, n: sheetValue, isDefault: true });
  const selected = user.newPerDay ?? (sheetListed ? sheetValue : null);
  return { options, selected };
}

export function cleanUserSettings(raw: unknown): UserSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<UserSettings>;
  const n = Number(r.newPerDay);
  return {
    newPerDay: r.newPerDay != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null,
    listeningEnabled: typeof r.listeningEnabled === 'boolean' ? r.listeningEnabled : null,
    readAnswer: typeof r.readAnswer === 'boolean' ? r.readAnswer : null
  };
}

export async function loadUserSettings(): Promise<UserSettings> {
  return cleanUserSettings(await getMeta('userSettings'));
}

export async function saveUserSettings(u: UserSettings): Promise<void> {
  await setMeta('userSettings', cleanUserSettings(u));
}
