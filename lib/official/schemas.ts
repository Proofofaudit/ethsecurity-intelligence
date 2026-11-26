/**
 * Runtime schemas for TheDAO Security Fund public API.
 * List schema mirrors https://initiatives.thedao.fund/api/initiatives.schema.json (schemaVersion 2).
 * Detail/revision/comment schemas were derived from the public source
 * (BlossomLabs/thedao-initiatives api/) and verified against live responses on 2026-11-26.
 */
import { z } from "zod";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "invalid date-time");
const httpsUrl = z.string().url();

export const CategorySchema = z.object({ slug: z.string().min(1), label: z.string().min(1) });

export const ListPledgeSchema = z.object({
  company: z.string(),
  amountUsd: z.number().nonnegative(),
  status: z.enum(["pledged", "received"]),
});

export const ListMilestoneSchema = z.object({
  name: z.string(),
  amountUsd: z.number().nonnegative(),
  adoption: z.boolean(),
  done: z.boolean(),
  targetMonth: z.string().nullable(),
  criteria: z.array(z.string()),
});

export const DonateSchema = z
  .object({
    safeAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    chainId: z.number().int(),
    chain: z.string(),
    enabled: z.boolean(),
    tokens: z.array(z.object({ symbol: z.string(), address: z.string().nullable(), decimals: z.number().int() })),
  })
  .nullable();

export const ListInitiativeSchema = z.object({
  slug: z.string().min(1),
  url: httpsUrl,
  markdownUrl: httpsUrl,
  title: z.string().min(1),
  type: z.enum(["rfp", "grant"]),
  categories: z.array(CategorySchema).max(3),
  status: z.enum(["open", "ballot", "funded"]),
  summary: z.string(),
  goalUsd: z.number().nonnegative(),
  raisedUsd: z.number().nonnegative(),
  pctFunded: z.number().min(0).max(100),
  backers: z.number().int().nonnegative(),
  recipientTeam: z.string().nullable().optional(),
  recipientUrl: z.string().nullable().optional(),
  durationMonths: z.number().int().nullable().optional(),
  approvedAt: isoDate.nullable().optional(),
  createdAt: isoDate.nullable().optional(),
  donate: DonateSchema,
  pledges: z.array(ListPledgeSchema),
  sections: z.array(z.object({ key: z.string(), heading: z.string(), markdown: z.string() })),
  milestones: z.array(ListMilestoneSchema),
  links: z.array(z.string()),
  details: z.string().nullable().optional(),
});

export const ListResponseSchema = z.object({
  schemaVersion: z.literal(2),
  generatedAt: isoDate,
  count: z.number().int().nonnegative(),
  /** Across every approved initiative, whatever the filters. Never used for cohort metrics. */
  totals: z.object({
    goalUsd: z.number(),
    raisedUsd: z.number(),
    backers: z.number().int(),
    rfps: z.number().int(),
    grants: z.number().int(),
  }),
  initiatives: z.array(ListInitiativeSchema),
});

export const DetailMilestoneSchema = z.object({
  name: z.string(),
  amount: z.number().nonnegative(),
  adoption: z.boolean(),
  done: z.boolean(),
  link: z.string().optional().default(""),
  month: z.string().optional().default(""),
  criteria: z.array(z.string()),
});

export const RevisionMetaSchema = z.object({
  n: z.number().int().positive(),
  author: z.string().optional(),
  source: z.string().optional(),
  archived: z.boolean().optional(),
  state: z.string().optional(),
  createdAt: z.number(),
});

export const DetailPledgeSchema = z.object({
  id: z.string(),
  company: z.string(),
  amountUsd: z.number().nonnegative(),
  status: z.enum(["pledged", "received"]),
  note: z.string().optional().default(""),
  url: z.string().optional().default(""),
  logoUrl: z.string().optional().nullable(),
  createdAt: z.number().optional(),
});

export const DonationSchema = z.object({
  txHash: z.string(),
  tokenSymbol: z.string().optional().default(""),
  tokenAddress: z.string().nullable().optional(),
  amount: z.number().optional(),
  amountRaw: z.string().optional(),
  amountUsd: z.number().nullable().optional(),
  donor: z.string().optional().nullable(),
  status: z.string(),
  detail: z.string().optional().default(""),
  source: z.string().optional().default(""),
  createdAt: z.number().optional(),
  confirmedAt: z.number().optional().nullable(),
});

export const DetailResponseSchema = z.object({
  refreshDue: z.boolean().optional(),
  initiative: z.object({
    id: z.string().min(10),
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    details: z.string().optional().default(""),
    discourseUrl: z.string().optional().default(""),
    goalUsd: z.number().nonnegative(),
    status: z.string(),
    type: z.enum(["rfp", "grant"]),
    safeAddress: z.string().optional().nullable(),
    paidOutUsd: z.number().optional().default(0),
    proposer: z.string().optional().nullable(),
    durationMonths: z.number().int().nullable().optional(),
    recipientTeam: z.string().nullable().optional(),
    recipientUrl: z.string().nullable().optional(),
    topup: z.boolean().optional().default(false),
    milestoneReviewer: z.string().nullable().optional(),
    /** Detail endpoint returns category slugs; labels come from the list endpoint. */
    categories: z.array(z.union([z.string(), CategorySchema])),
    sections: z.record(z.string(), z.string()),
    milestones: z.array(DetailMilestoneSchema),
    links: z.array(z.string()),
    structured: z.boolean().optional(),
    revision: z.number().int().optional(),
    createdAt: z.number().optional(),
    approvedAt: z.number().optional().nullable(),
  }),
  revisions: z.array(RevisionMetaSchema).optional().default([]),
  summary: z.object({
    pledged: z.number(),
    received: z.number(),
    donated: z.number(),
    total: z.number(),
    live: z.boolean().optional(),
    refreshDue: z.boolean().optional(),
    ledger: z.number().optional().nullable(),
    paidOut: z.number().optional().default(0),
  }),
  onBallot: z.boolean(),
  pct: z.number().optional(),
  pledges: z.array(DetailPledgeSchema),
  donations: z.array(DonationSchema).optional().default([]),
  funded: z.boolean().optional(),
  donationsEnabled: z.boolean().optional(),
  ledger: z
    .object({ checkedAt: z.number().optional().nullable(), ok: z.boolean().optional(), intervalMinutes: z.number().optional() })
    .partial()
    .optional()
    .nullable(),
});

export const RevisionResponseSchema = z.object({
  revision: RevisionMetaSchema.extend({
    title: z.string(),
    summary: z.string(),
    details: z.string().optional().default(""),
    sections: z.record(z.string(), z.string()).nullable().optional(),
    milestones: z.array(DetailMilestoneSchema).nullable().optional(),
    links: z.array(z.string()).nullable().optional(),
    structured: z.boolean().optional(),
    goalUsd: z.number().nullable().optional(),
  }),
});

export const CommentsResponseSchema = z.object({
  entries: z.array(
    z
      .object({
        id: z.string(),
        body: z.string().optional().default(""),
        name: z.string().optional().nullable(),
        createdAt: z.number().optional(),
      })
      .passthrough(),
  ),
});

export type ListResponse = z.infer<typeof ListResponseSchema>;
export type ListInitiative = z.infer<typeof ListInitiativeSchema>;
export type DetailResponse = z.infer<typeof DetailResponseSchema>;
export type RevisionResponse = z.infer<typeof RevisionResponseSchema>;
export type CommentsResponse = z.infer<typeof CommentsResponseSchema>;
