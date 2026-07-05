// localStorage scores (spec Task 12). No backend; best-score-per-mission.
// Defensive by contract: try/catch on every storage op (private mode / sandbox
// throw on access), schema-validated parse, corrupt JSON → reset to {}. Keeps
// best (max) on write. Pure logic over a guarded globalThis accessor so it
// unit-tests in node with a shim localStorage — no DOM needed.

const KEY = 'nabhasa.scores.v1';

export type Scores = Record<string, number>; // missionId → best score

// globalThis guard: reading localStorage can throw in some sandboxes; in node
// it's undefined. Tests inject a shim onto globalThis.localStorage.
function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function isValid(v: unknown): v is Scores {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  for (const val of Object.values(v)) {
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return false;
  }
  return true;
}

export function loadScores(): Scores {
  const s = storage();
  if (!s) return {};
  let raw: string | null;
  try {
    raw = s.getItem(KEY);
  } catch {
    return {};
  }
  if (raw == null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : {};
  } catch {
    return {}; // corrupt JSON → reset
  }
}

// Persists only if score beats the stored best for this mission. Returns the
// scores map as it stands after the call (never throws).
export function saveScore(missionId: string, score: number): Scores {
  const cur = loadScores();
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return cur;
  const prev = cur[missionId] ?? 0;
  if (score <= prev) return cur; // keep best
  const next: Scores = { ...cur, [missionId]: score };
  const s = storage();
  if (s) {
    try {
      s.setItem(KEY, JSON.stringify(next));
    } catch {
      // private mode / quota — in-memory return still reflects the new best
    }
  }
  return next;
}

export function clearScores(): void {
  const s = storage();
  if (s) {
    try {
      s.removeItem(KEY);
    } catch {
      // ignore
    }
  }
}
