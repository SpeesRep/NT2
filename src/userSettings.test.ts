import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDb, db, getMeta, setMeta } from './db';
import { effectiveSettings } from './settings';
import { getNewPerDay } from './today';
import { EMPTY_USER_SETTINGS, newPerDayChoices, saveUserSettings, loadUserSettings } from './userSettings';
import { answerIsDutch, listenMode } from './tts';
import { BackupError, checkBackup, exportBackup, importBackup } from './backup';
import { DEFAULT_SETTINGS, type Card } from './types';
import { progressKey, type Progress } from './scheduler';

const sheet = { ...DEFAULT_SETTINGS, new_per_day: 10, listen_share: 1 };
const word = { id: 'w1', type: 'word', nl: 'huis', article: 'het', pos: '', fr: 'maison', example_nl: '', example_fr: '', tags: [], flags: [], answer: '', added: '2026-10-01', active: true } as Card;

beforeEach(() => {
  indexedDB = new IDBFactory();
  _resetDb();
});

describe('effective new cards per day', () => {
  it('her choice overrides the Sheet; null falls back to Settings.new_per_day', () => {
    expect(getNewPerDay(sheet, { newPerDay: 15 })).toBe(15);
    expect(getNewPerDay(sheet, { newPerDay: null })).toBe(10);
    expect(effectiveSettings(sheet, { ...EMPTY_USER_SETTINGS, newPerDay: 5 }, true).new_per_day).toBe(5);
    expect(effectiveSettings(sheet, EMPTY_USER_SETTINGS, true).new_per_day).toBe(10);
  });

  it('the dropdown shows the effective value; a Sheet value outside 5/10/15/20 gets "Standaard (X)"', () => {
    expect(newPerDayChoices(10, EMPTY_USER_SETTINGS)).toEqual({
      options: [5, 10, 15, 20].map((n) => ({ value: n, n, isDefault: false })), selected: 10
    });
    const odd = newPerDayChoices(8, EMPTY_USER_SETTINGS);
    expect(odd.options[0]).toEqual({ value: null, n: 8, isDefault: true });
    expect(odd.selected).toBeNull(); // → "Standaard (8)" is shown, not a wrong number
    expect(newPerDayChoices(8, { ...EMPTY_USER_SETTINGS, newPerDay: 20 }).selected).toBe(20);
  });

  it('is stored on the phone (meta.userSettings) and survives a restart', async () => {
    await saveUserSettings({ newPerDay: 15, listeningEnabled: false, readAnswer: false });
    _resetDb();
    expect(await loadUserSettings()).toEqual({ newPerDay: 15, listeningEnabled: false, readAnswer: false });
  });
});

describe('listening', () => {
  it('switched off: a card never comes in listening mode (other modes stay)', () => {
    const on = effectiveSettings(sheet, EMPTY_USER_SETTINGS, true);
    const off = effectiveSettings(sheet, { ...EMPTY_USER_SETTINGS, listeningEnabled: false }, true);
    expect(listenMode(word, 'recog', 0, on)).toBe(true); // listen_share 1 → always, when on
    expect(listenMode(word, 'recog', 0, off)).toBe(false);
  });

  it('defaults to on with a Dutch voice; without one it is off even if she switched it on', () => {
    expect(effectiveSettings(sheet, EMPTY_USER_SETTINGS, true).listening).toBe(true);
    expect(effectiveSettings(sheet, EMPTY_USER_SETTINGS, false).listening).toBe(false);
    expect(effectiveSettings(sheet, { ...EMPTY_USER_SETTINGS, listeningEnabled: true }, false).listening).toBe(false);
  });
});

describe('Antwoord voorlezen', () => {
  it('default on with a Dutch voice; she can switch it off; never without a voice', () => {
    expect(effectiveSettings(sheet, EMPTY_USER_SETTINGS, true).readAnswer).toBe(true);
    expect(effectiveSettings(sheet, { ...EMPTY_USER_SETTINGS, readAnswer: false }, true).readAnswer).toBe(false);
    expect(effectiveSettings(sheet, EMPTY_USER_SETTINGS, false).readAnswer).toBe(false);
  });

  it('only a Dutch answer is read (not the French back of nl_fr or a listening card)', () => {
    expect(['fr_nl', 'question', 'cloze', 'oneway'].every(answerIsDutch)).toBe(true);
    expect(answerIsDutch('nl_fr')).toBe(false);
    expect(answerIsDutch('listen')).toBe(false);
  });
});

describe('JSON backup', () => {
  const prog = (key: string, last: string): Progress => ({
    key, card_id: key.split('|')[0], track: 'recog', state: 'Review', due: '2026-10-10T10:00:00.000Z', stability: 5,
    difficulty: 5, reps: 3, lapses: 0, last_review: last, learning_steps: 0, scheduled_days: 5
  });

  it('export → import round-trips userSettings, progress, unsent reviews and flags', async () => {
    const d = await db();
    await d.put('progress', prog(progressKey('w1', 'recog'), '2026-10-03T10:00:00.000Z'));
    await d.put('queue', { event_id: 'e1', card_id: 'w1', track: 'recog', ts: '2026-10-03T10:00:00.000Z', rating: 3, mode: 'nl_fr', duration_ms: 1, snapshot: {} as never });
    await d.put('flags', { id: 'f1', card_id: 'w1', ts: 'x', note: 'n', resolved: false, updated_ts: 'x' });
    await setMeta('userSettings', { newPerDay: 20, listeningEnabled: false, readAnswer: null });
    const file = JSON.parse(JSON.stringify(await exportBackup()));

    indexedDB = new IDBFactory(); // a new phone
    _resetDb();
    expect(await importBackup(file)).toEqual({ progress: 1, queue: 1, flags: 1 });
    expect(await getMeta('userSettings')).toEqual({ newPerDay: 20, listeningEnabled: false, readAnswer: null });
    const d2 = await db();
    expect((await d2.get('progress', 'w1|recog'))?.reps).toBe(3);
    expect(await d2.get('queue', 'e1')).toBeTruthy();
    expect((await d2.get('flags', 'f1'))?.note).toBe('n');
  });

  it('merges: newer progress on the phone is kept', async () => {
    const d = await db();
    await d.put('progress', prog('w1|recog', '2026-10-01T10:00:00.000Z'));
    const file = JSON.parse(JSON.stringify(await exportBackup()));
    await d.put('progress', { ...prog('w1|recog', '2026-10-04T10:00:00.000Z'), reps: 9 });
    expect((await importBackup(file)).progress).toBe(0);
    expect((await d.get('progress', 'w1|recog'))?.reps).toBe(9);
  });

  it('refuses other files and backups of the other app (DEV/PROD)', () => {
    expect(() => checkBackup({ hello: 1 })).toThrow(BackupError);
    expect(() => checkBackup({ app: 'speesrep', version: 1, ns: 'speesrep-other', progress: [], queue: [], flags: [], meta: {} })).toThrow('otherApp');
  });
});
