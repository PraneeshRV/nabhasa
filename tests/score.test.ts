import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadScores, saveScore, clearScores } from '../src/game/score';

// Node has no DOM localStorage; score.ts reads globalThis.localStorage, so we
// inject a Map-backed shim per test. (globalThis guard makes this deterministic
// regardless of any native node localStorage.)
const KEY = 'nabhasa.scores.v1';

function makeLS(store = new Map<string, string>()): Storage {
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

let map: Map<string, string>;

beforeEach(() => {
  map = new Map();
  (globalThis as { localStorage?: Storage }).localStorage = makeLS(map);
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('score — round-trip + best-keeps', () => {
  it('save then load round-trips', () => {
    const out = saveScore('m1', 500);
    expect(out.m1).toBe(500);
    expect(loadScores().m1).toBe(500);
  });

  it('keeps the best (max) score per mission', () => {
    saveScore('m1', 500);
    saveScore('m1', 700);
    expect(loadScores().m1).toBe(700);
    saveScore('m1', 300); // worse → ignored
    expect(loadScores().m1).toBe(700);
  });

  it('tracks multiple missions independently', () => {
    saveScore('m1', 500);
    saveScore('m2', 900);
    const s = loadScores();
    expect(s.m1).toBe(500);
    expect(s.m2).toBe(900);
  });

  it('clearScores wipes the store', () => {
    saveScore('m1', 500);
    clearScores();
    expect(loadScores()).toEqual({});
  });
});

describe('score — corrupt / invalid storage resets', () => {
  it('empty when no key', () => {
    expect(loadScores()).toEqual({});
  });

  it('corrupt JSON → reset', () => {
    map.set(KEY, '{not json');
    expect(loadScores()).toEqual({});
  });

  it('non-object JSON → reset', () => {
    map.set(KEY, '[1,2,3]');
    expect(loadScores()).toEqual({});
    map.set(KEY, '42');
    expect(loadScores()).toEqual({});
    map.set(KEY, 'null');
    expect(loadScores()).toEqual({});
  });

  it('schema-invalid object → reset', () => {
    map.set(KEY, JSON.stringify({ m1: 'not-a-number' }));
    expect(loadScores()).toEqual({});
    map.set(KEY, JSON.stringify({ m1: NaN }));
    expect(loadScores()).toEqual({});
    map.set(KEY, JSON.stringify({ m1: -10 }));
    expect(loadScores()).toEqual({});
  });

  it('valid object parses intact', () => {
    map.set(KEY, JSON.stringify({ m1: 500, m2: 900 }));
    expect(loadScores()).toEqual({ m1: 500, m2: 900 });
  });
});

describe('score — private mode / throwing storage never throws', () => {
  it('loadScores returns {} when getItem throws', () => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };
    expect(loadScores()).toEqual({});
  });

  it('saveScore does not throw when setItem throws', () => {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    };
    expect(() => saveScore('m1', 500)).not.toThrow();
  });

  it('rejects non-finite / negative scores without writing', () => {
    saveScore('m1', 500);
    saveScore('m1', NaN);
    saveScore('m1', Infinity);
    saveScore('m1', -1);
    expect(loadScores().m1).toBe(500);
  });
});
