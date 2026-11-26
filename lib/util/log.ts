/**
 * Server-side error logging that never records request content. Error messages can echo user
 * input (search text, AI Lab prompts, names typed into forms, JSON fragments), so only a fixed
 * event label, the error class and a short machine code are written.
 */
const CODE = /^[A-Za-z0-9_.-]{1,40}$/;

export function describeError(err: unknown): string {
  const name = err instanceof Error && CODE.test(err.name) ? err.name : typeof err === "object" && err !== null ? "Error" : typeof err;
  const raw = typeof err === "object" && err !== null && "code" in err ? (err as { code: unknown }).code : undefined;
  const code = (typeof raw === "string" || typeof raw === "number") && CODE.test(String(raw)) ? ` code=${String(raw)}` : "";
  return `${name}${code}`;
}

/** `scope` and `event` must be fixed strings chosen by the caller, never request data. */
export function logServerError(scope: string, event: string, err: unknown): void {
  console.error(`[${scope}] ${event}: ${describeError(err)}`);
}
