import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake server: a Log that de-duplicates on event_id, like the Apps Script API.
const serverLog = new Map<string, unknown>();
let failNext = 0;
vi.mock('./api', () => ({
  apiPost: vi.fn(async (_action: string, payload: { events: { event_id: string }[] }) => {
    if (failNext > 0) {
      failNext--;
      throw new Error('network');
    }
    const accepted: string[] = [];
    const duplicate: string[] = [];
    for (const e of payload.events) {
      if (serverLog.has(e.event_id)) duplicate.push(e.event_id);
      else {
        serverLog.set(e.event_id, e);
        accepted.push(e.event_id);
      }
    }
    return { accepted, duplicate, rejected: [] };
  }),
  apiGet: vi.fn()
}));

const { _resetDb, pendingEvents, recordReview, mergeServerProgress, allProgress } = await import('./db');
const { pushQueue } = await import('./sync');
const { makeScheduler, previewOutcomes, snapshotOf } = await import('./scheduler');
const { todaysIntro } = await import('./session');

const sched = makeScheduler({ desired_retention: 0.9 });
let n = 0;
async function review(card_id: string, rating: 1 | 2 | 3 | 4 = 3) {
  const now = new Date(Date.UTC(2026, 8, 28, 10, n++));
  const o = previewOutcomes(sched, card_id, 'recog', undefined, now)[rating];
  const next = { ...o.next, last_review: now.toISOString() };
  await recordReview(
    next,
    { event_id: `ev-${n}`, card_id, track: 'recog', ts: now.toISOString(), rating, mode: 'nl_fr', duration_ms: 1000, snapshot: snapshotOf(next) },
    todaysIntro(undefined, now)
  );
  return next;
}

beforeEach(() => {
  indexedDB = new IDBFactory();
  _resetDb();
  serverLog.clear();
  failNext = 0;
});

describe('review queue sync', () => {
  it('a review is stored with its event in one go, and pushed exactly once', async () => {
    await review('a');
    await review('b');
    expect((await pendingEvents()).length).toBe(2);
    expect(await pushQueue()).toBe(2);
    expect(await pendingEvents()).toEqual([]);
    expect(serverLog.size).toBe(2);
    expect(await pushQueue()).toBe(0);
    expect(serverLog.size).toBe(2);
  });

  it('a failed push keeps every event; the retry sends them once', async () => {
    await review('a');
    await review('b');
    failNext = 1;
    await expect(pushQueue()).rejects.toThrow();
    expect((await pendingEvents()).length).toBe(2);
    await pushQueue();
    expect(serverLog.size).toBe(2);
    expect(await pendingEvents()).toEqual([]);
  });

  it('if the server stored events but the reply was lost, the resend is de-duplicated', async () => {
    await review('a');
    const events = await pendingEvents();
    for (const e of events) serverLog.set(e.event_id, e); // server got them, phone never heard back
    await pushQueue();
    expect(serverLog.size).toBe(1);
    expect(await pendingEvents()).toEqual([]);
  });

  it('events recorded while offline accumulate and all go out later', async () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) await review(id);
    expect((await pendingEvents()).map((e) => e.card_id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    await pushQueue();
    expect([...serverLog.keys()].length).toBe(5);
  });

  it('server progress never overwrites a card with an unsent local review', async () => {
    const local = await review('a');
    const older = { ...local, stability: 99, last_review: '2030-01-01T00:00:00.000Z' };
    await mergeServerProgress([older]);
    expect((await allProgress()).get(local.key)!.stability).toBe(local.stability);
    await pushQueue();
    await mergeServerProgress([older]);
    expect((await allProgress()).get(local.key)!.stability).toBe(99);
  });
});
