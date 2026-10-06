import type { Settings } from './types';
import { getState, setState, useStore, type State } from './store';
import { getNewPerDay } from './today';
import { useUiSettings } from './prefs';
import { cleanUserSettings, newPerDayChoices, saveUserSettings, type UserSettings } from './userSettings';

// THE settings accessor. It merges the Sheet's Settings with the learner's own (phone-only) user settings and
// what the phone can do (a Dutch voice). Components read settings ONLY through useSettings(); other code uses
// currentSettings(). Nobody reads state.settings / state.userSettings directly.

export type EffectiveSettings = Settings & {
  /** Listening cards are on: a Dutch voice exists and she did not switch them off. */
  listening: boolean;
  /** "Antwoord voorlezen": a Dutch answer is read out loud when it is shown (default on, needs a Dutch voice). */
  readAnswer: boolean;
};

export function effectiveSettings(sheet: Settings, user: UserSettings, hasVoice: boolean): EffectiveSettings {
  return {
    ...sheet,
    new_per_day: getNewPerDay(sheet, user),
    listening: hasVoice && (user.listeningEnabled ?? true),
    readAnswer: hasVoice && (user.readAnswer ?? true)
  };
}

function fromState(s: State, showFrenchHelp: boolean): EffectiveSettings {
  const e = effectiveSettings(s.settings, s.userSettings, s.hasVoice);
  // Before IndexedDB is loaded, show_french_help comes from the cached last Sheet value (no flash of "Hulp").
  return s.loaded ? e : { ...e, show_french_help: showFrenchHelp };
}

export function useSettings(): EffectiveSettings {
  const s = useStore();
  const ui = useUiSettings();
  return fromState(s, ui.show_french_help);
}

export function currentSettings(): EffectiveSettings {
  const s = getState();
  return effectiveSettings(s.settings, s.userSettings, s.hasVoice);
}

/** What the Instellingen page shows: the effective value of each row (her choice, else the default). */
export function useSettingControls() {
  const s = useStore();
  const eff = effectiveSettings(s.settings, s.userSettings, s.hasVoice);
  return {
    newPerDay: newPerDayChoices(s.settings.new_per_day, s.userSettings),
    listeningEnabled: { on: eff.listening, available: s.hasVoice },
    readAnswer: { on: eff.readAnswer, available: s.hasVoice }
  };
}

/** Saves one of her settings at once (no save button); it applies at the next card selection. */
export async function setUserSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): Promise<void> {
  const next = cleanUserSettings({ ...getState().userSettings, [key]: value });
  setState({ userSettings: next });
  await saveUserSettings(next);
}
