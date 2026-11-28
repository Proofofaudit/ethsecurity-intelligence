import type { Correction, CorrectionState, Dataset } from "@/lib/domain/schemas";

export interface StoreHealth {
  backend: "mongodb" | "file";
  ok: boolean;
  detail: string;
  /** True when the configured primary backend failed and we are serving the file dataset. */
  degraded: boolean;
}

/**
 * Storage contract shared by the MongoDB and file adapters. The dataset is read-only to the
 * application; only the research pipeline (db:load / publish) writes it. Corrections are the
 * only public write path and never modify research records directly.
 */
export interface IntelligenceStore {
  readonly backend: "mongodb" | "file";
  getDataset(): Promise<Dataset>;
  listCorrections(filter?: { states?: CorrectionState[]; targetId?: string; initiativeId?: string }): Promise<Correction[]>;
  getCorrection(id: string): Promise<Correction | null>;
  createCorrection(c: Correction): Promise<void>;
  /** Optimistic update: fails if the stored state differs from expectedState. */
  updateCorrection(id: string, expectedState: CorrectionState, next: Correction): Promise<boolean>;
  countSubmissionsSince(submitterKey: string, sinceIso: string): Promise<number>;
  /**
   * Deletes private contact ciphertexts older than CONTACT_RETENTION_DAYS and returns how many
   * were removed. Every other store method runs it first, so an expired contact is never read.
   */
  purgeExpiredContacts(now?: Date): Promise<number>;
  health(): Promise<StoreHealth>;
}
