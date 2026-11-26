# Data dictionary

Field reference for the published dataset (`data/published/dataset.json`), the MongoDB collections and the browser-only workspace. The zod schemas in [lib/domain/schemas.ts](lib/domain/schemas.ts) are the source of truth; MongoDB validators and indexes are in [lib/db/setup.ts](lib/db/setup.ts).

Conventions:

- Money is integer US cents (`...Cents`). Vote manifest amounts are six-decimal USD strings kept as micro-USD (`...MicroUsd`).
- Timestamps are ISO 8601 strings in UTC unless named as unix seconds.
- `null` means unknown or not reported, never zero.
- Every collection document also carries `datasetVersion` and `_id` equal to `id` when loaded into MongoDB.

## Dataset layout and collections

| Dataset key | MongoDB collection | Record |
| --- | --- | --- |
| `meta` | `dataset_meta` (document `current`) | DatasetMeta |
| `vote` | `dataset_meta` (document `current`) | VoteSection |
| `initiatives` | `initiatives` | Initiative |
| `milestones` | `milestones` | Milestone |
| `pledges` | `pledges` | Pledge |
| `donations` | `donations` | Donation |
| `organizations` | `organizations` | Organization |
| `aliases` | `organization_aliases` | OrganizationAlias |
| `people` | `people` | Person |
| `repositories` | `repositories` | Repository |
| `products` | `products` | Product |
| `integrations` | `integrations` | Integration |
| `previousGrants` | `previous_grants` | PreviousGrant |
| `securityProblems` | `security_problems` | SecurityProblem |
| `claims` | `claims` | Claim |
| `evidence` | `evidence_sources` | Evidence |
| `relationships` | `relationships` | Relationship |
| `revisions` | `proposal_revisions` | Revision |
| `changes` | `changes` | ChangeRecord |
| `researchJobs` | `research_jobs` | ResearchJob |
| (not in dataset) | `corrections` | Correction |
| (not in dataset) | `official_snapshots` | Snapshot manifest (`snapshotId`, `createdAt`, `status` valid or invalid) |
| (not in dataset) | `metrics` | Computed metric values per `datasetVersion` and `scope` (`cohort` or an initiative id) |
| (not in dataset) | `methodology_versions` | Metric registry per methodology `version` |
| (not in dataset) | `research_results` | Raw research result per `initiativeId` and `task` |

## Shared types

**Origin** (`origin`): `official`, `external`, `applicant`, `derived`, `ai`, `curated`. See [METHODOLOGY.md](METHODOLOGY.md#sources-and-origins).

**EvidenceStatus** (`status`): `independently_verified`, `officially_reported`, `applicant_reported`, `partially_supported`, `not_independently_verified`, `contradicted`, `disputed`, `future_target`, `outdated`, `not_applicable`. Definitions in [METHODOLOGY.md](METHODOLOGY.md#evidence-statuses).

**Provenance** (`provenance`): `origin`, `sourceUrls` (string[]), `retrievedAt`, `method` (how it was obtained), `version` (pipeline or methodology version).

**LifecycleStage**: `development`, `testing`, `deployment`, `transaction_construction`, `signing`, `runtime_execution`, `monitoring`, `threat_detection`, `incident_response`, `recovery`, `infra_opsec`.

## DatasetMeta

| Field | Type | Meaning |
| --- | --- | --- |
| `datasetVersion` | string | Snapshot id plus content hash of the published dataset. |
| `generatedAt` | string | When `npm run publish` wrote the dataset. |
| `officialGeneratedAt` | string | When the official snapshot was taken. |
| `officialSourceUrl` | string | Base URL of the official API. |
| `methodologyVersion` | string | `METHODOLOGY_VERSION` used. |
| `cohort` | object | `frozenAt`, `size`, `ids`, `slugs` of the frozen research cohort. |
| `ingestion` | object | `startedAt`, `finishedAt`, `requests`, `failedRequests[]` (`url`, `error`), `validation[]` (`check`, `ok`, `detail`). |
| `research` | object or null | `startedAt`, `finishedAt`, `pipelineVersion`, `requests`, `failures` of the latest research run. |
| `snapshotId`, `previousSnapshotId` | string, string or null | Official snapshot used and the one before it. |
| `contentHash` | string | Hash of the dataset content. |

## VoteSection (official vote manifest)

Source: `https://initiatives.thedao.fund/api/vote/manifest`. Stored in the `current` document of `dataset_meta` next to `meta`, so both move together.

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | `aligned`, `unaligned`, `unavailable` | `aligned` only when `slugs[i]` and `projects[i]` were confirmed to belong together for every index. |
| `statusReason` | string | Why the status was set. |
| `groupsAvailable` | boolean | Affiliation groups may be used (status `aligned`). |
| `scheduleAvailable` | boolean | The tally schedule may be used. |
| `sourceUrl` | string | Manifest URL. |
| `fetchedAt` | string or null | When the manifest was fetched. |
| `stale` | boolean | The live fetch failed and the last stored manifest was reused. |
| `objectHash` | string or null | Content address of the raw manifest object. |
| `kind`, `chainId`, `contract`, `configRevision` | as published | Round kind, chain id, vote contract address, configuration revision. |
| `readAt` | object or null | `block`, `timestamp` at which TheDAO read the contract. |
| `opensAt`, `closesAt` | int (unix s) or null | Round opening and the latest settlement time. |
| `schedule` | object or null | `opensAt`, `firstTallyAt[]` (unix s, S, A, B), `initialWindow` and `maxWindows` of the quiet ending. |
| `poolMicroUsd` | string or null | Pool exactly as published, micro-USD. |
| `poolCents` | int or null | Pool in cents; null when the micro-USD value has sub-cent digits. |
| `ballotRules` | boolean or null | Whether the round enforces ballot rules. |
| `independentTiers` | int or null | Bitmask of tiers where rules 2 and 3 apply (bit 0 = S, bit 1 = A). |
| `slugs` | string[] | Initiative slugs by project index, as published. |
| `projects` | object[] | Per index: `goalMicroUsd` (registered goal), `rfp`, `groups` (indexes into `groups`). |
| `groups` | string[] | Affiliation group names. |
| `initiativeGroups` | record | Initiative id to group names. Empty unless `status` is `aligned`. |
| `alignment` | object | `ok` and `checks[]` (`check`, `ok`, `detail`), see [METHODOLOGY.md](METHODOLOGY.md#official-vote-manifest). |

At request time the server may replace `poolMicroUsd`, `poolCents`, `opensAt`, `closesAt`, `schedule`, `scheduleAvailable` and `readAt` with a validated live manifest read, cached for 12 minutes (`LIVE_FIELDS` in `lib/vote/live.ts`). It does so only when the stored `status` is `aligned` or `unaligned`; an `unavailable` section is returned as stored, with no pool or schedule. All other fields, including `status`, `configRevision`, `ballotRules`, the groups, `fetchedAt`, `objectHash` and `stale`, always describe the published snapshot: `fetchedAt` and `objectHash` are the snapshot's fetch time and content address, and `configRevision` is the configuration the published groups and ballot rules come from. So the returned `readAt.block` is always the block of the returned pool. The stored section is never changed by this. `GET /api/v1/vote-manifest` reports the source in `live`:

| Field | Type | Meaning |
| --- | --- | --- |
| `live.source` | `live`, `snapshot` | Where the returned pool and schedule come from. |
| `live.fetchedAt` | string or null | When the server read the live values shown; null for the snapshot. |
| `live.checkedAt` | string or null | The server's last read attempt. |
| `live.error` | string or null | Why the last read was not used (failed or did not validate). |
| `live.note` | string | Plain-language summary. Names both revisions when the live read's `configRevision` differs from the published one. |
| `live.fields` | string[] | The fields above that came from the live read; empty for the snapshot. |
| `live.configRevision` | string or null | Configuration revision of the live read shown; null for the snapshot. |
| `live.revisionNote` | string or null | Set when the live read's `configRevision` differs from the published one; shown on the data-freshness page and above the Ballot Prep rule checks. |

## Initiative

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `slug` | string | Official id (ULID) and slug. |
| `title`, `shortTitle`, `summary` | string | Official text. |
| `type` | `grant` or `rfp` | Initiative type. |
| `url`, `markdownUrl` | string | Official page and its Markdown export. |
| `categories` | object[] | Official categories (`slug`, `label`). |
| `listStatus`, `approvalStatus` | string | Official list and approval status. |
| `onBallot` | boolean | The ballot list returns it and its endpoint reports `onBallot`. |
| `cohortMember` | boolean | Member of the frozen research cohort. |
| `eligibilityNote` | string or null | Set when eligibility changed after the cohort was frozen. |
| `recipientTeam`, `recipientUrl` | string or null | Official recipient. |
| `organizationId` | string or null | Resolved recipient organization. |
| `durationMonths`, `topup`, `milestoneReviewer` | as published | Official proposal fields. |
| `discourseUrl`, `safeAddress` | string or null | Discussion link and the initiative's Safe. |
| `approvedAt`, `createdAt`, `revision` | as published | Official dates and current revision number. |
| `structured` | boolean | The proposal uses the structured template. |
| `sections` | object[] | Proposal sections (`key`, `heading`, `markdown`). Applicant text. |
| `links`, `textLinks` | array | Official links, and links found in proposal text (`url`, `text`, `section`). |
| `funding` | Funding | See below. |
| `stages` | object[] | Lifecycle mapping: `stage`, `matchedTerms`, `hits` (used only to order stages, never a score), `primary`. |
| `standards` | string[] | Standards named in the proposal (for example EIPs). |
| `commentCount` | int or null | Official comment count. |
| `contentHash` | string | Hash of the official record. |
| `provenance` | Provenance | Origin `official`. |

### Funding

| Field | Type | Meaning |
| --- | --- | --- |
| `goalCents` | int | Funding goal. |
| `officialRaisedCents` | int | Official raised (`summary.total`) = pledged + donated. |
| `pledgedCents` | int | Outstanding pledges. |
| `receivedCents` | int | Received pledges, already inside `donatedCents`. |
| `donatedCents` | int | Confirmed donations including received pledges. |
| `paidOutCents` | int | Paid out to the team. |
| `ledgerCents` | int or null | Safe balance reported by the API; may be cached. |
| `live` | boolean or null | Official live flag. |
| `officialPct` | number or null | Official funded percentage. |
| `remainingCents` | int | Remaining funding gap, `max(0, goal - raised)`. Secondary metric. |
| `theDaoAskCents` | int or null | TheDAO ask, `min(20000000, max(0, goal - raised))` in cents ($200,000 cap). Null when an input is unavailable. |
| `ledgerCheckedAt` | string or null | When the ledger value was checked. |

## Milestone

`id`, `initiativeId`, `index`, `name`, `amountCents`, `shareOfGoal` (number or null), `adoption` (paid on third-party uptake), `done`, `targetMonth` (string or null), `link` (artifact, string or null), `criteria` (string[]), `questions[]` (`code`, `question`: deterministic reviewer questions), `dependencyTerms` (string[]), `provenance`.

## Pledge

`id`, `initiativeId`, `backerId` (resolved organization), `company` (official label), `amountCents`, `status` (`pledged` or `received`), `url`, `note`, `createdAt`, `provenance`.

## Donation

`id`, `initiativeId`, `txHash` (0x plus 64 hex characters), `tokenSymbol`, `amountUsdCents` (int or null), `status`, `confirmedAt`, `explorerUrl`, `provenance`.

## Organization

`id`, `name`, `kind` (`recipient`, `backer`, `both`, `related`), `anonymous` (never merged when true), `names` (all official spellings), `website`, `initiativeIds`, `backedInitiativeIds`, `github`, `description`, `websiteCheck` (`url`, `status`, `finalUrl`, `title`, `description`, `checkedAt`, `ok`, or null), `githubProfile` (`login`, `type`, `name`, `blog`, `createdAt`, `publicRepos`, `url`, or null), `notes[]` (`text`, `sourceUrls`, `status`, `origin`), `provenance`.

## OrganizationAlias

`id`, `alias`, `organizationId`, `resolution` (`exact_normalized`, `same_official_domain`, `curated_with_evidence`, `candidate_unconfirmed`, `anonymous_not_merged`), `candidateOrganizationId` (string or null), `reason`, `sourceUrls`.

## Person

`id`, `name`, `role`, `initiativeIds`, `organizationId`, `publicProfiles` (string[]), `mentionedIn` (string[]), `provenance`.

## Repository

`id`, `fullName`, `url`, `initiativeIds`, `exists`, `checkedAt`, `description`, `license`, `archived`, `fork`, `defaultBranch`, `createdAt`, `pushedAt`, `stars`, `openIssues`, `language`, `topics`, `latestRelease` (`tag`, `publishedAt`, `url`, or null), `releaseCount`, `hasCiWorkflows`, `hasTestsDir`, `hasSecurityPolicy`, `hasReadme`, `commitsLast90d`, `contributorsSampled`, `error`, `provenance`. Values come from the GitHub REST API; null means not observed.

## Product

`id`, `name`, `url`, `initiativeIds`, `kind` (`website`, `app`, `docs`, `dashboard`, `package`, `paper`, `dataset`, `other`), `reachable`, `status` (HTTP status), `title`, `checkedAt`, `provenance`.

## Integration and PreviousGrant

Integration: `id`, `initiativeId`, `counterparty`, `statement`, `section`, `kind` (`existing`, `planned`, `adoption_target`), `status`, `sourceUrls`, `provenance`.

PreviousGrant: `id`, `initiativeId`, `funder`, `statement`, `amountCents` (int or null), `status`, `sourceUrls`, `provenance`.

## SecurityProblem

`id` (a LifecycleStage), `label`, `description`, `terms` (string[]), `officialCategoryHints` (string[]).

## Claim

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `initiativeId` | string | |
| `kind` | enum | `milestone_deliverable`, `milestone_completed`, `existing_artifact`, `quantitative`, `integration`, `previous_funding`, `funding_pledge`, `funding_received`, `donation`, `team`, `adoption_commitment`, `curated_finding`. |
| `assertion` | string | The statement checked. |
| `origin` | Origin | Who made the statement. |
| `section`, `quote` | string or null | Proposal section and verbatim quote. |
| `sourceUrls` | string[] | Where the statement appears. |
| `evidenceIds`, `supportingEvidenceIds`, `contradictingEvidenceIds` | string[] | Evidence checked, supporting and contradicting. |
| `status` | EvidenceStatus | Current status. |
| `verificationMethod` | string | How the status was reached, in plain text. |
| `verifiedAt` | string or null | When it was last checked. |
| `limitations` | string[] | What the check could not establish. |
| `material` | boolean | Counts toward evidence coverage. |
| `history[]` | object | `at`, `status`, `assertion`, `reason`, `correctionId`. |

## Evidence

`id`, `kind` (`official_record`, `http_check`, `github_repository`, `github_pull_request`, `github_profile`, `onchain_transaction`, `proposal_text`, `curated_source`), `url`, `title`, `observedAt`, `facts` (record of short machine-observed values), `excerpt`, `ok`, `provenance`.

## Relationship

`id`, `from` and `to` (`type`: EntityType, `id`), `type` (`funds`, `develops`, `maintains`, `integrates`, `depends_on`, `addresses`, `proposes`, `references`, `potentially_overlaps`, `potentially_complements`), `confidence` (`confirmed`: official or external evidence; `stated`: applicant text; `inferred`: derived heuristic), `reason`, `evidenceIds`, `sourceUrls`.

EntityType: `initiative`, `organization`, `backer`, `person`, `repository`, `technology`, `standard`, `product`, `integration`, `milestone`, `problem`.

## Revision

`id`, `initiativeId`, `n`, `createdAt`, `source`, `state`, `archived`, `title`, `summary`, `sections` (record or null), `milestones` (`name`, `amountCents`, `adoption`, `done`, `criteria`, or null), `goalCents`, `fetched` (the revision body was retrieved).

## ChangeRecord

`id`, `initiativeId` (or null for cohort-wide), `detectedAt`, `kind` (`funding_changed`, `pledge_added`, `pledge_removed`, `pledge_status_changed`, `pledge_amount_changed`, `goal_changed`, `milestones_changed`, `milestone_completed`, `text_changed`, `revision_added`, `eligibility_changed`, `claim_status_changed`, `correction_published`, `donation_added`), `summary`, `before`, `after`, `source` (`snapshot_diff`, `official_revision`, `correction`, `research`), `fromSnapshot`, `toSnapshot`.

## ResearchJob

`id`, `initiativeId`, `task` (`links`, `websites`, `github`, `milestone_artifacts`, `claims`, `donations_onchain`, `curated`), `state` (`pending`, `running`, `succeeded`, `failed`, `skipped`), `attempts`, `inputHash`, `startedAt`, `finishedAt`, `error`, `resultCount`.

## Correction

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | |
| `targetType`, `targetId`, `initiativeId` | | `claim` or `initiative` and its id. |
| `category` | enum | `incorrect`, `outdated`, `missing_context`, `missing_evidence`, `misattributed`, `other`. |
| `proposedCorrection` | string, max 4000 | |
| `evidenceUrl` | string, https only, max 2000 | |
| `explanation` | string, max 6000 | |
| `attribution` | string or null | Optional public attribution. |
| `contactCiphertext` | string or null | AES-256-GCM ciphertext of an optional private contact. Never returned publicly. |
| `contactExpiresAt` | string or null | Submission + 30 days; the ciphertext is deleted on the first store access after it. |
| `state` | enum | `submitted`, `under_review`, `disputed`, `accepted`, `partially_accepted`, `rejected`, `resolved`. |
| `resolution` | string or null | Public resolution text. |
| `appliedChange` | object or null | `status`, `assertion`, `limitation` applied to the claim when accepted. |
| `submittedAt`, `updatedAt` | string | |
| `history[]` | object | `at`, `state`, `note`. |
| `submitterKey` | string | HMAC-SHA-256 of the network address, for rate limiting. Never returned publicly. |

`PublicCorrection` (API and MCP) omits `contactCiphertext`, `contactExpiresAt` and `submitterKey`.

## Derived fields in API and MCP summaries

- `affiliatedWith`: for each initiative, the other initiatives that share a manifest affiliation group (`vote.initiativeGroups`). Empty when groups are unavailable.
- Metrics: values of the registry in [METHODOLOGY.md](METHODOLOGY.md#metric-registry), via `GET /api/v1/metrics`.
- `GET /api/v1/vote-manifest` returns the manifest from the last sync: status and reason, enabled features, round fields, pool, schedule, groups, per-initiative groups (only when aligned) and the alignment checks.

## Browser-only data

Kept in the browser's local storage, never sent to the server ([components/workspace/schema.ts](components/workspace/schema.ts)).

`esi.workspace` (version 1, extended only with defaulted fields):

| Field | Meaning |
| --- | --- |
| `initiatives[]` | Saved initiatives: `id`, `addedAt`, `reviewedAt`, `priority` (`high`, `medium`, `low` or null). |
| `searches[]`, `comparisons[]` | Saved searches and comparisons. |
| `bookmarks[]` | Bookmarked claims with the status seen when saved. |
| `notes[]`, `questions[]`, `priorities[]`, `assessments[]` | Personal notes, open questions, research priorities, draft assessments with a fingerprint of the dataset version. |
| `lastVisited`, `lastReviewAt` | Last page visited and when the change log was last reviewed. |
| `funding` | `seen` and `baseline` snapshots of TheDAO asks (`datasetVersion`, `at`, `asks` by initiative id in cents) for "since your last visit". |
| `ballotDraft` | Ballot Prep draft: `tiers` (initiative id to `S`, `A` or `B`) and `updatedAt`. Never submitted. |
| `affiliations` | `entries` (organizations typed, up to 50), `overrides` (initiative id to `mine` or `not_mine`), `suggested`. |
| `interest` | May interest you inputs: `focus` (chip ids `cat:<slug>` or `mode:<id>`), `keywords`, `suggested`. |

`esi.lab.templates`: AI Lab templates. `esi.theme`: `light`, `dark` or `system`.

### Ballot draft export

Export JSON in Ballot Prep downloads a file with `format` `ethsecurity-intelligence/ballot-draft@1`, `exportedAt`, `note`, `datasetVersion`, `poolMicroUsd`, `tiers` (`S`, `A`, `B`: `slug`, `title`) and `checks` (size, independent, group and order results with micro-USD amounts as strings, or null when checks are off). It is created in the browser and is not a ballot.
