# Methodology

Methodology version `2026.11-v1` (`METHODOLOGY_VERSION` in [lib/metrics/registry.ts](lib/metrics/registry.ts)). The in-app Methodology page (`/methodology`) renders the same definitions from the code. Where this file reproduces a table from the code, the code is the single source and this file says which module holds it.

ETHSecurity Intelligence is research and decision-support only. Nothing here ranks, scores or advises. All wording follows [NEUTRAL_LANGUAGE.md](NEUTRAL_LANGUAGE.md).

## Sources and origins

Every record carries its origin (`Origin` in [lib/domain/schemas.ts](lib/domain/schemas.ts)) and provenance (source URLs, retrieval time, method, version):

| Origin | Meaning | Shown as |
| --- | --- | --- |
| `official` | Copied from TheDAO Security Fund API or vote manifest. Never overwritten by research. | Official data |
| `applicant` | Stated by the applicant in proposal text. | Applicant statement (verbatim quote) |
| `external` | Observed by the research pipeline from a public third-party source. | Independent evidence |
| `derived` | Computed deterministically from the above. | Labeled with its formula |
| `curated` | Recorded by a researcher with cited sources. | Independent evidence, with sources |
| `ai` | AI-generated interpretation. Never treated as verified fact. | AI interpretation |

Missing information is shown as "Not found" or "Unavailable", never as 0 and never as a negative finding.

## Evidence statuses

Each statement has exactly one status. The status mark is always shown with its text label.

| Status | Label | Definition |
| --- | --- | --- |
| `independently_verified` | Independently verified | Machine-observed evidence from a source other than the applicant confirms the statement, for example the GitHub API showing a cited repository is public, or an onchain receipt confirming a donation. |
| `partially_supported` | Partially supported | Evidence supports part of the statement but does not confirm all of it, for example a merged pull request linked to a milestone marked complete. |
| `applicant_reported` | Applicant-reported | Stated by the applicant in the proposal. Shown as a verbatim quote and not treated as fact. |
| `not_independently_verified` | Not independently verified | The research pipeline looked for supporting evidence and found none. This is not evidence that the statement is false. |
| `officially_reported` | Officially reported | Recorded in the official TheDAO Security Fund API, such as goals, pledges and milestones. |
| `future_target` | Future target | A planned deliverable or commitment. It cannot be verified until it happens. |
| `contradicted` | Contradicted by evidence | Observed evidence conflicts with the statement. |
| `disputed` | Disputed | The statement is the subject of an unresolved dispute. |
| `outdated` | Outdated | Superseded by newer information. |
| `not_applicable` | Not applicable | The status does not apply to this record. |

Only machine-observed evidence can produce `independently_verified` or `partially_supported`. Applicant text is always `applicant_reported` or `future_target`.

## Claims and verification

`research/claims.ts` extracts claims of these kinds: milestone deliverables and completions, existing artifacts (repositories, products, links), quantitative statements, integrations, previous funding, pledges, received funding, donations, team profiles, adoption commitments and curated findings. Each claim stores the verbatim quote, its section, the evidence it was checked against and a plain-text `verificationMethod`, for example:

- Donations: each official transaction receipt is fetched from public Ethereum JSON-RPC and must exist, have succeeded and transfer to the initiative's Safe.
- Repositories: the GitHub REST API must return the cited repository as public.
- Team profiles: GitHub confirms that a linked account exists. Ownership of the profile is not verified, and the method says so.
- Previous grants: quoted from the proposal. Funder records were not independently retrieved.

Accepted public corrections change a claim's status or assertion and add an entry to its history.

## Truth audit

`npm run publish` runs `research/audit.ts` before writing `data/published/dataset.json`. The audit recomputes every published figure and quote from the raw, content-addressed official objects: funding identities, per-initiative and cohort sums, milestones, pledges, donations, quotes, the TheDAO ask and remaining gap, the vote pool, schedule, ballot rules flag, manifest arrays, alignment and affiliation groups. Publication is refused when any check fails. The result is stored in `data/published/audit.json`.

## Funding identities

- Official raised = outstanding pledges + confirmed donations (`summary.total`). Received pledges are already inside donations and are never added twice.
- The ballot endpoint's `totals` block is never used, because it covers all approved initiatives, not the cohort.
- All money is integer US cents. Manifest values are six-decimal USD strings, handled as integer micro-USD (BigInt) and converted to cents only when exact.

## TheDAO ask and remaining funding gap

| Metric | Formula | Role |
| --- | --- | --- |
| TheDAO ask (`initiative.thedao_ask`) | `min(200000, max(0, goalUsd - raisedUsd))` | Headline funding figure: what the initiative still asks TheDAO's pool for. |
| TheDAO ask, sum (`cohort.thedao_ask`) | sum of the per-initiative asks over the cohort | Unavailable if any initiative's ask is unavailable. |
| Remaining funding gap (`initiative.remaining`, `cohort.remaining`) | `max(0, goalUsd - raisedUsd)`, uncapped | Separate, secondary metric shown for context. |

- Over-funded or exactly funded initiatives ask $0.
- Unavailable inputs make the ask "Unavailable", never 0 (`lib/metrics/ask.ts`).
- The $200,000 cap is the update specification's cap. It equals TheDAO's ballot qualification setting `capUsd` (200,000 in `shared/vote.ts` of [BlossomLabs/thedao-initiatives](https://github.com/BlossomLabs/thedao-initiatives)): an initiative qualifies for the ballot with no more than $200,000 left. For initiatives on the ballot the cap therefore does not change the value. In the dataset of 26 Nov 2026 13:08 UTC the largest single gap was $199,000, and the TheDAO ask sum equaled the remaining gap sum.
- The ask is computed from the official API at each sync. The vote contract computes its own ask onchain when a ballot is recorded, and the two can differ between syncs.

## Official vote manifest

`npm run ingest` fetches `https://initiatives.thedao.fund/api/vote/manifest` (payload under `manifest`) and stores it content-addressed with the snapshot (`research/ingest.ts`, `lib/vote/manifest.ts`).

- **Alignment.** Group-dependent features use the manifest only after `checkAlignment` confirms: the round kind, `projects.length == slugs.length`, unique slugs, the same set of slugs as the cohort, for every index the same registered goal and RFP flag as the official ballot record, valid group indexes, RFPs without groups, and the accounts length. Only then is `status` `aligned` and `initiativeGroups` filled.
- **Unaligned.** The raw arrays are kept as published, never remapped, and groups are not used.
- **Unavailable.** A 4xx response or a changed shape makes the manifest unavailable. Transport errors, 5xx and 429 reuse the previous stored manifest, marked stale.
- **Disabled features.** When groups or the schedule are unavailable, the UI lists what is off: affiliation groups, Ballot Prep checks and the tally countdown from the official schedule.
- **Pool.** `poolUsd` (micro-USD) converted exactly to cents. A value with sub-cent digits is shown as unavailable rather than rounded.
- **Live pool and schedule.** Between publishes, the server re-reads the manifest at most once every 12 minutes (`LIVE_TTL_MS` in `lib/vote/constants.ts`), shared by every visitor and API caller, so TheDAO's API is never called per user or per request (`lib/vote/live.ts`). The Overview, My Workspace, the data-freshness page and `GET /api/v1/vote-manifest` show the live `poolUsd`, `opensAt`, `closesAt`, `schedule` and `readAt` only when the published snapshot holds a manifest (status aligned or unaligned; an unavailable snapshot shows no pool or schedule until a dataset with the manifest is published) and the read passes the response schema, the same alignment check against the published cohort and ballot goals, and the schedule check. A failed or invalid read never replaces a valid value: the last valid live read stays, or else the published snapshot, and the data-freshness page reports the failure. Affiliation groups, registered goals and TheDAO asks are not refreshed this way; they change only when a new dataset passes the truth audit and is published, and the published `configRevision` stays with them (the API's `live.configRevision` gives the live read's; when they differ, `live.revisionNote` names both, on the data-freshness page and above the Ballot Prep rule checks). The Overview, My Workspace, the data-freshness page and the API are rendered on every request and read the shared cache, so no page cache adds to its age: a pool or schedule shown is at most 12 minutes old, and the Vote Calendar shows the read time. `ESI_LIVE_MANIFEST=off` turns the live read off (the end-to-end tests and screenshots use the snapshot only).

## Vote Calendar

Tally times come from the manifest `schedule.firstTallyAt` (unix seconds, S, A, B). Each tally starts at 21:00 UTC. The countdown floors to the minute and the strip shows local time, UTC and India Standard Time (`Asia/Kolkata`). The round counts as settled at the manifest `closesAt`. "A tier settles within N hours" is computed from the manifest's halving tally windows (`initialWindow` + `initialWindow`/2 + ... for `maxWindows` windows, rounded up to whole hours; 48 for the current round). When `schedule.firstTallyAt` is unavailable, the tally times fall back to the dates in TheDAO's [voting post](https://paragraph.com/@thedao.fund/voting-is-live-which-security-initiatives-will-make-s-tier): S-tier 3 Dec, A-tier 7 Dec and B-tier 9 Dec 2026, each at 21:00 UTC ("Each tally starts at 9:00 PM UTC"). The settled state then starts 48 hours after the B-tier fallback tally (11 Dec 2026 21:00 UTC; the post: "A tier always settles within 48 hours of its first tally"). The strip says "Fallback times, manifest unavailable", each tier row is marked "(fallback)", and the data-freshness page flags the fallback. Dates that are not in the manifest (results by 5, 9 and 11 Dec; community funding until 31 Jan 2027) are quoted from that post (`lib/vote/calendar.ts`).

"Since your last visit" compares the TheDAO asks you last saw, stored in your browser. A new visit starts after more than 30 minutes without a page view.

## Ballot Prep rules

Ballot Prep in My Workspace is an unofficial pre-check of a private draft (`lib/vote/ballot-rules.ts`). TheDAO's official vote app and contract are authoritative. All amounts are integer micro-USD.

1. **Size.** The TheDAO asks of all initiatives on the draft (S + A + B) sum to at least `ceil(1.5 x poolUsd)`. When the asks of all initiatives in the round sum to less than that, the requirement is that sum instead, so a draft holding every initiative passes.
2. **Independence.** S-tier holds at least 3 initiatives that are pairwise unaffiliated: no two of the three share an affiliation group. Initiatives with no groups (every RFP) are unaffiliated with everything.
3. **Group share.** For every affiliation group present in S-tier, `2 x (sum of registered goals of its S-tier initiatives) <= (sum of registered goals of all S-tier initiatives)`. Exactly 50% passes.

Rules 2 and 3 apply to the tiers named by the manifest's `independentTiers` bitmask (bit 0 = S, bit 1 = A); the current round sets `1`, S-tier only. The official app also requires that no tier is left empty while a later tier has picks, and Ballot Prep checks that too. Each failing rule shows a one-line fix.

**Note on rule 1: asks, not goals.** The update specification described rule 1 as "sum of goals of S+A+B >= 1.5 x poolUsd". Ballot Prep checks the sum of **asks** instead, because that is what TheDAO enforces:

- TheDAO's voting post of 17 Nov 2026: "The Initiatives on a ballot must ask for at least 1.5x the value of TheDAO's 400 ETH." ([source](https://paragraph.com/@thedao.fund/voting-is-live-which-security-initiatives-will-make-s-tier))
- The official rules module, `shared/vote/rules.ts` in [BlossomLabs/thedao-initiatives](https://github.com/BlossomLabs/thedao-initiatives/blob/main/shared/vote/rules.ts) (commit `9944ee6`, 26 Nov 2026): "a valid ballot requests (in asks) at least 1.5x the pool (or every project's ask, when donations took that sum below 1.5x the pool)", with the minimum computed as `(3n * round.poolUsd + 1n) / 2n`.
- The contract `vote/contracts/SignedBallots.sol` (`_validateBallot`) counts "each placed project's ask (goal less donations and open pledges) at the block that records the ballot" and reverts with `BallotTooSmall` below the minimum.

Checking goals would report drafts as passing that the contract rejects. Rules 2 and 3 use registered goals, as the official code does.

**Limits of the pre-check.** Asks in Ballot Prep come from the dataset (cents, at the last sync). The contract uses live asks with micro-USD precision at the block that records the ballot, and treats initiatives withdrawn by an admin as asking $0. Results near a boundary can differ.

## Affiliation flags

Two independent signals (`lib/vote/affiliation.ts`). Neither hides or reorders an initiative.

- **Official groups.** "Affiliated with:" lists the other initiatives that share an affiliation group in the manifest. Shown only when the manifest is aligned; otherwise the flag is off and the page says why.
- **My affiliations.** The organizations a holder types in My Workspace are matched in the browser against each initiative's manifest groups, official recipient team, organization names and published aliases (aliases marked anonymous or unconfirmed are excluded). A match shows "You may be affiliated" with the matched text, and Ballot Prep shows "Possibly your own or affiliated" next to the tier choice. Manual marks ("affiliated" or "not affiliated") override the automatic match. Ballot rule 3 counts only the official manifest groups, and the S-tier reminder says so.

Matching rule:

- Text is folded to lower case without accents and split into words at anything that is not a letter or digit. One-character words are dropped.
- An entry is also tried as the text inside and outside its parentheses: "Security Alliance (SEAL)" is tried as itself, "Security Alliance" and "SEAL".
- Official texts are split into name segments (`nameSegments`): the parts inside and outside parentheses, then at commas, semicolons, slashes, and at hyphens in a part without spaces. "Security Alliance (SEAL) Intel" gives "SEAL" and "Security Alliance Intel"; "SEETA, Libp2p" gives "SEETA" and "Libp2p"; "ValOS-Lionscraft" gives "ValOS" and "Lionscraft"; "Safi El-Hassanine" stays one segment.
- A term matches a target when the full texts are equal without punctuation, or when the term names a segment: (1) the term's distinctive (non-generic) words are the segment's first distinctive words, in order; (2) the segment's words before its first distinctive word are in the term ("a", "an" and "the" excepted); (3) every other word of the term is in the segment or optional (the optional words below, or a number such as "911"); (4) when the term adds such a word, the segment adds nothing but connecting words (a, an, and, at, by, for, in, of, on, the, to, with), because two different suffixes mean two names. The reverse (a segment naming the start of the term) counts only when the segment has two or more distinctive words.
- A manifest group that is exactly a name of one organization in the identity table also carries that organization's other names: group "Argot" carries "Argot Collective", and group "SEAL" carries "Security Alliance (SEAL)", "SEAL Security Frameworks" and "Security Alliance (SEAL) Intel". The tag then reads `manifest affiliation group "Argot" (organization name "Argot Collective")`.
- Examples: "SEAL" and "SEAL 911" match "Security Alliance (SEAL) Intel", "Security Alliance" matches all four SEAL initiatives, "Kann" matches "Kann Audits", "Lionscraft" matches "ValOS-Lionscraft", "Blossom Labs Ltd" matches "Blossom Labs", "Nethermind Security" matches "Nethermind", "Remix Project" matches "Remix" and "Kleros DAO" matches "Kleros". "Intel" and "Intel Foundation" do not match "Security Alliance (SEAL) Intel", "Bloom" and "Bloom Network" do not match "Sem Bloom", "Alliance" does not match "Security Alliance", "Runtime Foundation" and "Runtime Verification" do not match "Runtime Capital", "Proof Network" and "Succinct Proof Labs" do not match "Proof of Audits", "Alliance DAO" does not match "Security Alliance (SEAL)" and "Walnut Capital" does not match "Walnut". `tests/unit/affiliation.test.ts` checks these against the published cohort.
- Limits: a single word that starts an official name matches it ("Runtime" matches "Runtime Capital", "Proof" matches "Proof of Audits", "Sem" matches "Sem Bloom"); the tag shows the matched text and the holder can mark it as not affiliated. An entry naming a project that no official text or alias links to its organization (for example "Sourcify" and group "Argot") matches only the texts that contain it.
- Generic words never match on their own. The stoplist (`GENERIC_WORDS`, 60 words, edit it in `lib/vote/affiliation.ts`): a, ag, ai, an, and, association, at, audit, audits, by, capital, co, collective, com, company, cooperative, core, corp, dao, digital, eth, ethereum, for, foundation, fund, gmbh, grant, group, in, inc, io, lab, labs, llc, ltd, network, networks, of, on, open, org, project, protocol, protocols, research, sa, security, software, solutions, studio, systems, team, tech, technologies, technology, the, to, ventures, with, xyz. So "Ethereum Foundation" matches nothing unless an official text is exactly that.
- Optional words may be added (under condition 4) or left out without changing the organization meant (`OPTIONAL_WORDS`, 32 words): a, ag, an, and, at, by, co, com, corp, for, foundation, gmbh, in, inc, io, lab, labs, llc, ltd, network, of, on, org, project, research, sa, security, team, the, to, with, xyz.
- "DAO" (`SAME_NAME_OPTIONAL_WORDS`: dao) may be added only when the official text has no word the entry lacks: "Kleros DAO" matches "Kleros", while "Alliance DAO" matches neither "Security Alliance (SEAL)" nor "Security Alliance". Every other generic word ("Capital", "Ventures", "Protocol", ...) is part of the name when present.

**Public badge-holder directory: not shipped.** The update allowed an optional "Find my public profile" lookup over a bundled list of public badge-holder entries (handle, organizations, expertise), only if a verifiable public source exists. None does. Checked on 26 Nov 2026: thedao.fund/ethsecurity-badges (descriptive text, no list), the thedao.fund home page (names only the curators), `initiatives.thedao.fund` `/api/badge-holders`, `/api/vote/badge-holders`, `/api/holders` and `/api/badge` (all 404), and the BlossomLabs/thedao-initiatives source (it only checks whether a wallet holds the badge NFT). The lookup is shown disabled with that explanation, `BADGE_DIRECTORY` is empty and `BADGE_DIRECTORY_SOURCE` is null (`lib/vote/badge-directory.ts`). This project does not compile such a list itself.

## May interest you

An explained starting set built in the browser from local inputs only (`lib/vote/interest.ts`):

- Focus chips: the 10 official categories (alphabetical) and the 8 AI Lab research modes.
- Typed keywords.
- A category chip matches initiatives with that official category.
- A research mode matches initiatives in its mapped categories, or else whose official title, summary or listed standards contain one of its keywords.
- Keywords match whole words, case-insensitive; a space in a keyword also matches a hyphen. The last word of a keyword may carry one of these endings (`KEYWORD_ENDINGS`): s, es, ed, ing, er, ers. A last word ending in a consonant plus "y" also matches "ies" and "ied". A last word of three letters or more ending in a consonant plus "e" drops the "e" before "ed", "ing", "er" and "ers" ("s" and "es" stay on the full word). So "attack" finds "attacks", "maintain" finds "maintained", "bounty" finds "bounties", "secure" finds "securing" and "decentralize" finds "decentralized"; "audit" does not match "auditor". When the official text uses another form, the reason quotes it: the official summary mentions "attacks" (a form of "attack").
- Groups follow the chip order, then one group per typed keyword. Inside each group the order is alphabetical. An initiative can appear in more than one group.
- Every item states its reason ("Matches your selected focus: X" or "This may interest you because the official title mentions ...") with the matched text, and links to evidence: the official initiative page and, when one exists, an independent source for a supported statement. Items without an evidence link are left out.
- No score, rank or match percentage is computed.

### Research mode mapping (editable)

The single source is `FOCUS_MODE_TABLE` in [lib/vote/interest.ts](lib/vote/interest.ts). Edit it there; the Methodology page and the workspace view read it directly, and `tests/unit/methodology-doc.test.ts` fails if this copy differs.

| Research mode | Official categories | Keywords |
| --- | --- | --- |
| Smart contract auditor (`smart-contract-auditor`) | Audits & Analysis (`audits-analysis`), Formal Verification (`formal-verification`), Fuzzing & Testing (`fuzzing-testing`), Compilers & Languages (`compilers`) | audit, static analysis, fuzzing, formal verification, Solidity, compiler |
| Wallet engineer (`wallet-engineer`) | Wallets & Signing (`wallets-signing`), OpSec (`opsec`) | wallet, signing, clear signing, blind signing, hardware wallet, multisig |
| Infrastructure engineer (`infrastructure-engineer`) | Infrastructure & Clients (`infrastructure`), OpSec (`opsec`), Detection & Response (`detection-response`) | client, node, RPC, monitoring, reproducible |
| Security researcher (`security-researcher`) | Research & Education (`research-education`), Detection & Response (`detection-response`) | threat intelligence, vulnerability, exploit, incident |
| Grant evaluator (`grant-evaluator`) | None (keywords only) | maintenance, maintain, public good, open source |
| Funding analyst (`funding-analyst`) | None (keywords only) | bounty, risk pricing, insurance, pricing |
| Ecosystem researcher (`ecosystem-researcher`) | None (keywords only) | standard, EIP, ecosystem, public data |
| Independent adversarial reviewer (`adversarial-reviewer`) | None (keywords only) | attack, attacker, adversarial, threat model |

## Metric registry

All metrics are defined in [lib/metrics/registry.ts](lib/metrics/registry.ts) and computed in `lib/metrics/compute.ts`. The full definitions (description, source fields, required evidence, update frequency) are on the Methodology page and in `GET /api/v1/metrics`.

| ID | Name | Formula | Missing data |
| --- | --- | --- | --- |
| `cohort.initiatives` | Cohort initiatives | `count(cohort)` | Not applicable |
| `cohort.on_ballot` | Currently on ballot | `count(i where i.onBallot)` | Not applicable |
| `cohort.goal` | Funding requested | `sum goalUsd` | Initiative excluded and flagged |
| `cohort.raised` | Official raised | `sum (summary.pledged + summary.donated)` | Initiative excluded and flagged |
| `cohort.pledged_outstanding` | Outstanding pledges | `sum summary.pledged` | Treated as unavailable |
| `cohort.received_pledges` | Received pledges | `sum summary.received` | Treated as unavailable |
| `cohort.donated` | Confirmed donations | `sum summary.donated` | Treated as unavailable |
| `cohort.thedao_ask` | TheDAO ask (sum) | `sum min(200000, max(0, goalUsd - raisedUsd))` | Unavailable, never 0 |
| `cohort.thedao_pool` | TheDAO pool | `manifest.poolUsd / 10^4` (micro-USD to cents) | Unavailable when the manifest is missing, changed shape, or has sub-cent digits |
| `cohort.remaining` | Remaining funding gap | `sum max(0, goal - raised)` | Initiative excluded and flagged |
| `cohort.milestones` | Milestones | `count(milestones)` | Not applicable |
| `cohort.adoption_milestones` | Adoption milestones | `count(milestones where adoption)` | Not applicable |
| `cohort.adoption_budget` | Adoption-dependent budget | `sum amount where adoption` | Not applicable |
| `cohort.completed_milestones` | Completed milestones | `count(milestones where done)` | Not applicable |
| `cohort.pledge_records` | Pledge records | `count(pledges)` | Not applicable |
| `cohort.top5_backer_share` | Top-5 backer share | `sum top5(backer pledge total) / sum pledge totals` | Unavailable when there are no pledges |
| `cohort.research_coverage` | Research coverage | `count(i where all jobs succeeded) / count(cohort)` | Jobs never run count as not covered |
| `cohort.donations_verified` | Donations verified onchain | `count(verified tx) / count(tx)` | Unchecked transactions count as unverified |
| `initiative.goal` | Goal | `goalUsd` | Not applicable |
| `initiative.raised` | Official raised | `summary.pledged + summary.donated` | Not applicable |
| `initiative.pct_funded` | Funded | `raised / goal` | Unavailable when goal is zero |
| `initiative.thedao_ask` | TheDAO ask | `min(200000, max(0, goalUsd - raisedUsd))` | Unavailable when goal or raised is missing, never 0 |
| `initiative.remaining` | Remaining funding gap | `max(0, goal - raised)` | Not applicable |
| `initiative.donated_share` | Held share of raised | `donated / raised` | Unavailable when nothing is raised |
| `initiative.backers` | Distinct backers | `count(distinct backerId)` | Zero when there are no pledges |
| `initiative.top_backer_share` | Largest backer share | `max(backer total) / sum pledge totals` | Unavailable when there are no pledges |
| `initiative.backer_hhi` | Backer concentration (HHI) | `sum (backer share)^2` | Unavailable when there are no pledges |
| `initiative.self_pledged` | Self-pledged | `sum pledges where backerId = recipient organizationId` | Unavailable when the recipient is not a resolved organization |
| `initiative.milestones` | Milestones | `count(milestones)` | Not applicable |
| `initiative.largest_milestone_share` | Largest milestone share | `max(amount) / goal` | Unavailable when goal is zero |
| `initiative.adoption_share` | Adoption-dependent share | `sum amount where adoption / goal` | Unavailable when goal is zero |
| `initiative.open_questions` | Milestone questions | `sum milestone.questions` | Not applicable |
| `initiative.evidence_coverage` | Evidence coverage | `count(status in {independently_verified, partially_supported}) / count(material and status not in {future_target, officially_reported, not_applicable})` | Unavailable when there are no verifiable present-tense claims |
| `initiative.repos_public` | Public repositories cited | `count(cited repos where exists)` | Zero when none are cited |
| `initiative.repos_active_90d` | Repositories with commits in 90 days | `count(repos where commitsLast90d > 0)` | Repos with unknown activity are not counted |
| `initiative.repos_with_ci` | Repositories with CI workflows | `count(repos where hasCiWorkflows)` | Unknown counts as not present |

Repository activity, reachability and counts describe what exists publicly. They are not measures of security quality.

## Organization identity

`lib/domain/identity.ts` resolves backer and recipient names into organizations:

- `exact_normalized`: identical after normalizing case and punctuation.
- `same_official_domain`: official records link to the same website domain or GitHub owner.
- `curated_with_evidence`: matched by a researcher with cited sources (`data/curated/aliases.json`).
- `candidate_unconfirmed`: similar names without evidence. Kept separate and shown as "not confirmed as the same entity".
- `anonymous_not_merged`: anonymous or individual labels. Never merged.

A self-pledge is a pledge whose backer resolves to the initiative's own recipient. It is listed for transparency like every other self-pledge.

## Security lifecycle taxonomy

Eleven stages (`lib/domain/taxonomy.ts`), informed by the Ethereum Foundation's [Trillion Dollar Security](https://ethereum.org/reports/trillion-dollar-security/) overview: Development; Testing & verification; Deployment & supply chain; Transaction construction; Signing & wallets; Runtime & protocol execution; Monitoring; Threat detection & intelligence; Incident response & disclosure; Recovery; Infrastructure & operational security. An initiative maps to a stage when one of its official categories is a hint for that stage, or when its proposal text contains at least two distinct stage terms with three or more matches in total (whole words). At most four stages per initiative.

## Relationship hypotheses

`lib/intelligence/overlap.ts` (`overlap@1`) computes TF-IDF cosine similarity between initiatives plus shared stages, standards, repositories and backers. Pairs above the thresholds in `OVERLAP_THRESHOLDS` become "potentially overlaps" or "potentially complements" hypotheses. They are drawn dashed, labeled as hypotheses and never state a partnership, duplication or agreement.

## Milestone questions and blind spots

Milestone rules raise questions, not failures: no or very short acceptance criterion, adoption milestones without confirmed adopters, open milestones without a target month, more than half of the budget in one milestone, completion without a linked artifact, numeric adoption targets. Missing data is a reason to ask, never an accusation.

## Equal treatment

Proof of Audits builds this site and has an initiative on this ballot. The same templates, wording, research requirements and evidence standards apply to it as to every other initiative.

- `tests/unit/equal-treatment.test.ts` scans the code for any mention of Proof of Audits (name, slug, organization id). Engine code (`lib/intelligence`, `lib/metrics`, `lib/api`, `lib/db`, `lib/corrections`, `research`, `components/research`, `components/ui`, `components/graph`, `app/api`) must contain none. Elsewhere each mention is listed with a reason, and no line that selects it may contain sort, rank, score, weight, boost, priority, order, pin, feature or highlight. A parity test over all 55 dossiers checks identical sections, evidence rules, verification methods, research tasks and correction support.
- `isCoiOrganization` in `lib/disclosure.ts` is the only way to select Proof of Audits, and only to show a disclosure.
- A banner on every page reads: "Built by Proof of Audits, which has an initiative on this ballot. Unofficial tool. It never sees your vote. Every initiative is treated the same."

## Privacy

The Methodology page lists the same items, and `tests/unit/privacy.test.ts` checks them against the code.

- **Stored only in your browser** (local storage): `esi.workspace` (My Workspace, including the Ballot Prep draft, the TheDAO asks you last saw, your affiliations and marks, and your May interest you chips and keywords), `esi.lab.templates` (AI Lab templates), `esi.theme` (theme).
- **Stored on the server:** the public dataset; corrections you choose to submit; an optional private contact on a correction, encrypted with AES-256-GCM, never returned by the API or MCP, deleted 30 days after submission at the latest; an HMAC-SHA-256 of the submitting network address to limit submissions to five per hour; error logs with a fixed event name and error type only.
- **Never stored:** votes, ballots, wallet addresses or signatures (the site never connects a wallet); search text; AI Lab prompts and briefs (built in the browser); workspace contents; analytics, tracking cookies or third-party requests.

## Neutral language

See [NEUTRAL_LANGUAGE.md](NEUTRAL_LANGUAGE.md) (version `2026.11-v1`): allowed framing, banned phrases, the four source labels (Official data, Applicant statement, Independent evidence, AI interpretation), the "Not found" rule, official quotations and the enforcement by lint, runtime filter and skill builder.

## Limitations

- The cohort is frozen (`data/cohort.json`); later ballot changes are flagged, not applied.
- Automated research sees only public sources. "Not found" is not a negative finding.
- Ballot Prep and the TheDAO ask are computed from the last sync, not live onchain values.
- Hypotheses and what-if scenarios are exploration, not predictions.
