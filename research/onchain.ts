/**
 * Independent onchain verification of donation transactions listed by the official ledger.
 * Uses a public Ethereum JSON-RPC endpoint (configurable via ETH_RPC_URL). We only check that
 * the transaction exists, succeeded, and touched the initiative's Safe (as `to`, or as an
 * ERC-20 Transfer recipient in the logs). We do not re-price amounts.
 */
import path from "node:path";
import { RESEARCH_DIR, readJson, writeJson } from "./store";

/** Tried in order; a receipt missing on one node (pruned/lagging) is retried on the next. */
const RPCS = (process.env.ETH_RPC_URLS ?? "https://eth.drpc.org,https://ethereum-rpc.publicnode.com,https://eth.drpc.org").split(",").map((s) => s.trim()).filter(Boolean);
const CACHE_FILE = path.join(RESEARCH_DIR, "cache", "onchain-receipts.json");
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface TxCheck {
  txHash: string;
  found: boolean;
  success: boolean | null;
  blockNumber: number | null;
  touchesSafe: boolean | null;
  checkedAt: string;
  rpc: string;
  error: string | null;
}

export let rpcRequests = 0;

interface Receipt {
  status: string;
  blockNumber: string;
  to: string | null;
  logs: { address: string; topics: string[] }[];
}

let lock: Promise<unknown> = Promise.resolve();

/** Serialised wrapper: the receipt cache is a shared file. */
export function checkTransactions(items: { txHash: string; safe: string | null }[]): Promise<Map<string, TxCheck>> {
  const run = lock.then(() => checkTransactionsUnlocked(items));
  lock = run.catch(() => undefined);
  return run;
}

async function checkTransactionsUnlocked(items: { txHash: string; safe: string | null }[]): Promise<Map<string, TxCheck>> {
  const cache = (await readJson<Record<string, TxCheck>>(CACHE_FILE)) ?? {};
  const out = new Map<string, TxCheck>();
  const todo = items.filter((i) => {
    const c = cache[i.txHash];
    if (c && c.found && c.success !== null && c.touchesSafe === true) {
      out.set(i.txHash, c);
      return false;
    }
    return /^0x[0-9a-fA-F]{64}$/.test(i.txHash);
  });
  for (let i = 0; i < todo.length; i += 3) {
    let batch = todo.slice(i, i + 3);
    for (const rpc of RPCS) {
      if (batch.length === 0) break;
      await new Promise((r) => setTimeout(r, 400));
      const checkedAt = new Date().toISOString();
      const missing: typeof batch = [];
      try {
        rpcRequests++;
        const r = await fetch(rpc, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch.map((b, idx) => ({ jsonrpc: "2.0", id: idx, method: "eth_getTransactionReceipt", params: [b.txHash] }))),
          signal: AbortSignal.timeout(25_000),
        });
        const json = (await r.json()) as { id: number; result: Receipt | null; error?: { message: string } }[];
        if (!Array.isArray(json)) throw new Error("RPC did not return a batch response");
        for (const entry of json) {
          const b = batch[entry.id];
          if (!b) continue;
          const rc = entry.result;
          if (!rc) {
            missing.push(b);
            out.set(b.txHash, { txHash: b.txHash, found: false, success: null, blockNumber: null, touchesSafe: null, checkedAt, rpc: new URL(rpc).host, error: entry.error?.message ?? null });
            continue;
          }
          const safe = b.safe?.toLowerCase() ?? null;
          const touches = safe
            ? rc.to?.toLowerCase() === safe ||
              // Safe emits SafeReceived from its own address when it receives ETH (covers internal transfers).
              rc.logs.some((l) => l.address.toLowerCase() === safe) ||
              rc.logs.some((l) => l.topics[0] === TRANSFER_TOPIC && (l.topics[2] ?? "").toLowerCase().endsWith(safe.slice(2)))
            : null;
          const check: TxCheck = {
            txHash: b.txHash,
            found: true,
            success: rc.status === "0x1",
            blockNumber: parseInt(rc.blockNumber, 16),
            touchesSafe: touches,
            checkedAt,
            rpc: new URL(rpc).host,
            error: null,
          };
          cache[b.txHash] = check;
          out.set(b.txHash, check);
        }
      } catch (err) {
        for (const b of batch) {
          missing.push(b);
          if (!out.has(b.txHash)) out.set(b.txHash, { txHash: b.txHash, found: false, success: null, blockNumber: null, touchesSafe: null, checkedAt, rpc: new URL(rpc).host, error: String(err).slice(0, 160) });
        }
      }
      batch = missing;
    }
  }
  await writeJson(CACHE_FILE, cache, false);
  return out;
}
