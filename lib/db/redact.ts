/**
 * Remove connection strings, credentials and cluster host names from text before it is logged
 * or returned by a health endpoint. Driver errors can echo the host list of a cluster; the
 * connection string itself carries the password.
 */
export function redactSecrets(text: string, uri: string | undefined = process.env.MONGODB_URI): string {
  let out = text;
  if (uri) {
    out = out.split(uri).join("[redacted-uri]");
    try {
      const u = new URL(uri);
      if (u.password) out = out.split(decodeURIComponent(u.password)).join("[redacted]").split(u.password).join("[redacted]");
      if (u.username) out = out.split(decodeURIComponent(u.username)).join("[redacted]");
      for (const host of u.host.split(",")) {
        const name = host.replace(/:\d+$/, "");
        if (name && name !== "127.0.0.1" && name !== "localhost") out = out.split(name).join("[redacted-host]");
      }
    } catch {
      // Not a parseable URL; the generic patterns below still apply.
    }
  }
  return out
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, "[redacted-uri]")
    .replace(/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.mongodb\.net(?::\d+)?/gi, "[redacted-host]");
}

/** Error name and message with secrets removed. */
export function describeError(err: unknown, uri?: string): string {
  if (err instanceof Error) return redactSecrets(`${err.name}: ${err.message}`, uri);
  return redactSecrets(String(err), uri);
}
