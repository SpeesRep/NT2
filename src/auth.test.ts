import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Server-side permission logic (apps-script/Auth.gs + Data.gs), loaded as deployed with a fake Utilities.
const dir = join(__dirname, '..', 'apps-script');
const Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' },
  Charset: { UTF_8: 'utf8' },
  computeDigest: (_a: string, s: string) => [...createHash('sha256').update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
  getUuid: () => randomUUID()
};
// eslint-disable-next-line no-new-func
const gs = new Function('Utilities', `${['Util.gs', 'Data.gs', 'Auth.gs'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')};
  return { sha256Hex_, newKey_, looksLikeKey_, teacherForHash_, groupsForTeacher_, teacherGroup_, newGroupCode_, isGroupCode_, KEY_LENGTH };`)(Utilities);

type T = { teacher_id: string; inst_id: string; label: string; key_hash: string; active: boolean };
const teachers: T[] = [
  { teacher_id: 't1', inst_id: 'i1', label: 'Docent A', key_hash: gs.sha256Hex_('key-one'), active: true },
  { teacher_id: 't2', inst_id: 'i2', label: 'Docent B', key_hash: gs.sha256Hex_('key-two'), active: true },
  { teacher_id: 't3', inst_id: 'i1', label: 'Weg', key_hash: gs.sha256Hex_('key-three'), active: false },
  { teacher_id: 't4', inst_id: 'i3', label: 'Gesloten school', key_hash: gs.sha256Hex_('key-four'), active: true }
];
const institutions = [{ inst_id: 'i1', active: true }, { inst_id: 'i2', active: true }, { inst_id: 'i3', active: false }];
const groups = [
  { group_code: 'aaaaaaaa', inst_id: 'i1', active: true },
  { group_code: 'bbbbbbbb', inst_id: 'i1', active: false },
  { group_code: 'cccccccc', inst_id: 'i2', active: true }
];
const groupTeachers = [
  { group_code: 'aaaaaaaa', teacher_id: 't1' },
  { group_code: 'bbbbbbbb', teacher_id: 't1' },
  { group_code: 'cccccccc', teacher_id: 't1' }, // a wrong row: another institution's group
  { group_code: 'cccccccc', teacher_id: 't2' }
];

describe('keys', () => {
  it('hashes like SHA-256 hex', () => {
    expect(gs.sha256Hex_('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });
  it('makes 32-character keys without look-alikes, all different', () => {
    const keys = Array.from({ length: 200 }, () => gs.newKey_());
    keys.forEach((k: string) => {
      expect(k).toHaveLength(gs.KEY_LENGTH);
      expect(k).not.toMatch(/[0O1lI]/);
      expect(gs.looksLikeKey_(k)).toBe(true);
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('makes 8-character group codes without look-alikes', () => {
    for (let i = 0; i < 200; i++) {
      const c = gs.newGroupCode_();
      expect(gs.isGroupCode_(c)).toBe(true);
      expect(c).not.toMatch(/[0o1li]/);
    }
    expect(gs.isGroupCode_('aaaaaaa')).toBe(false);
    expect(gs.isGroupCode_('aaaaaaa0')).toBe(false);
  });
});

describe('who is the teacher', () => {
  const find = (key: string) => gs.teacherForHash_(gs.sha256Hex_(key), teachers, institutions);
  it('finds an active teacher of an active institution by key hash', () => {
    expect(find('key-one')?.teacher_id).toBe('t1');
  });
  it('refuses unknown, revoked, and closed-institution keys', () => {
    expect(find('nope')).toBeNull();
    expect(find('key-three')).toBeNull();
    expect(find('key-four')).toBeNull();
    expect(gs.teacherForHash_('', [{ ...teachers[0], key_hash: '' }], institutions)).toBeNull();
  });
});

describe('which groups', () => {
  it('only active groups of the own institution that are assigned', () => {
    expect(gs.groupsForTeacher_(teachers[0], groupTeachers, groups).map((g: { group_code: string }) => g.group_code)).toEqual(['aaaaaaaa']);
    expect(gs.groupsForTeacher_(teachers[1], groupTeachers, groups).map((g: { group_code: string }) => g.group_code)).toEqual(['cccccccc']);
  });
  it('never trusts a group code from the browser', () => {
    expect(gs.teacherGroup_(teachers[0], 'aaaaaaaa', groupTeachers, groups)?.group_code).toBe('aaaaaaaa');
    expect(gs.teacherGroup_(teachers[0], 'cccccccc', groupTeachers, groups)).toBeNull(); // other institution
    expect(gs.teacherGroup_(teachers[0], 'bbbbbbbb', groupTeachers, groups)).toBeNull(); // inactive
    expect(gs.teacherGroup_(teachers[1], 'aaaaaaaa', groupTeachers, groups)).toBeNull(); // not assigned
    expect(gs.teacherGroup_(teachers[0], '', groupTeachers, groups)).toBeNull();
  });
});
