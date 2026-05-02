/**
 * Persistent JSON store — uses eval to hide Node.js APIs from Turbopack static analysis.
 * Falls back to no-op in Edge Runtime (middleware).
 */

function getDataFilePath(): string | null {
  try {
    // Use indirect eval to prevent Turbopack from statically detecting Node.js APIs
    const cwd = new Function("return process.cwd()")();
    const p = new Function("return require('path')")();
    return p.join(cwd, "data", "hrms-data.json");
  } catch {
    return null;
  }
}

function getFs(): any {
  try {
    return new Function("return require('fs')")();
  } catch {
    return null;
  }
}

function getPath(): any {
  try {
    return new Function("return require('path')")();
  } catch {
    return null;
  }
}

export function loadData<T>(key: string, fallback: T): T {
  const fs = getFs();
  const file = getDataFilePath();
  if (!fs || !file) return fallback;
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, "utf-8");
    const all = JSON.parse(raw);
    return all[key] ?? fallback;
  } catch { return fallback; }
}

export function saveData(key: string, value: unknown) {
  const fs = getFs();
  const p = getPath();
  const file = getDataFilePath();
  if (!fs || !p || !file) return;
  try {
    const dir = p.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let all: Record<string, unknown> = {};
    try {
      if (fs.existsSync(file)) all = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch { /* ignore */ }
    all[key] = value;
    fs.writeFileSync(file, JSON.stringify(all, null, 2), "utf-8");
  } catch { /* Edge runtime — skip */ }
}
