import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const logDir = join(process.cwd(), "log");

// Kunto kerja lokal; satu baris JSON per entri. Fail-open: logging tidak boleh memutus request.
// Dengan sessionId, entri masuk ke log/session/<sessionId>/ agar mudah dilacak per sesi chat.
export function appendLog(category: string, entry: Record<string, unknown>, sessionId?: string | null): void {
  try {
    const dir = sessionId ? join(logDir, "session", sessionId) : logDir;
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...(sessionId ? { sessionId } : {}), ...entry });
    appendFileSync(join(dir, `${category}.ndjson`), `${line}\n`, "utf8");
  } catch {
    /* abaikan */
  }
}