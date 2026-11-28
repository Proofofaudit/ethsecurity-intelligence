# Data sources and attribution

The software in this repository is MIT licensed (see [LICENSE](LICENSE)). That license does not extend to third-party data. This file lists where the data in `data/` comes from and which terms apply.

## TheDAO Security Fund initiatives data

- **Source:** the public API of the TheDAO Security Fund initiatives board at [initiatives.thedao.fund](https://initiatives.thedao.fund): `/api/initiatives.json`, `/api/initiatives.schema.json`, the per-initiative endpoints, the ballot list and the vote manifest at `/api/vote/manifest`.
- **Software behind the source:** the board and its vote app are developed in [BlossomLabs/thedao-initiatives](https://github.com/BlossomLabs/thedao-initiatives). That repository is published under the MIT License, "Copyright (c) 2026 geleeroyale" ([LICENSE](https://github.com/BlossomLabs/thedao-initiatives/blob/main/LICENSE), checked 26 Nov 2026 with `gh api repos/BlossomLabs/thedao-initiatives/license`). The MIT License covers that code. It does not state terms for the initiative content served by the API.
- **Initiative content:** titles, summaries, proposal sections, milestones and team descriptions are written by the applicants. This project stores them unchanged, shows them as quotations labeled "Applicant statement" and links every record to its official page. Rights in that text remain with its authors.
- **Official records:** goals, pledges, donations, eligibility, ballot membership and the vote manifest are reproduced as published and labeled "Official data". TheDAO's official platform at [initiatives.thedao.fund/vote](https://initiatives.thedao.fund/vote) remains the authoritative source and the only place where votes are cast.
- **Official announcements:** short quotations of TheDAO's voting post ([paragraph.com/@thedao.fund](https://paragraph.com/@thedao.fund/voting-is-live-which-security-initiatives-will-make-s-tier), 17 Nov 2026) are marked as official quotations and linked to the post.

## Research sources

The research pipeline (`research/`) observes public sources and stores short machine-observed facts with the URL and time of each observation:

- **GitHub REST API** ([api.github.com](https://api.github.com/)): repository, profile, release, workflow and commit metadata of repositories cited in proposals. Subject to the [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service). Repository contents keep their own licenses.
- **Public Ethereum JSON-RPC** (eth.drpc.org, with ethereum-rpc.publicnode.com as fallback): transaction receipts for official donation records. Explorer links point to [etherscan.io](https://etherscan.io/).
- **Websites cited in proposals:** HTTP status, final URL, page title and description only. Each site remains under its own terms.
- **TheDAO transparency report** ([thedao.fund/transparency](https://thedao.fund/transparency)): Round 1 funding records (project name, amounts in ETH and USD, website, progress update link, direct grants and streams), read from the public page and its script bundle. Raw copies are stored in `data/external/round1/` for the truth audit. Labeled "Independent evidence".
- **Giveth forum** ([Ethereum Security QF Round: Results](https://forum.giveth.io/t/ethereum-security-qf-round-results-april-23-may-14-2026/2201)): round period, number of eligible projects, distribution announcement and transaction links, read from the topic's public Discourse JSON. Forum posts remain under the forum's terms and their authors' rights.
- **Taxonomy reference:** the security lifecycle taxonomy is informed by the Ethereum Foundation's [Trillion Dollar Security](https://ethereum.org/reports/trillion-dollar-security/) overview. Only the six domain names are reused.

## Our own data

The derived records in `data/published/` (claims, evidence statuses, relationships, metrics, audit results) and the curated files in `data/curated/` are produced by this project and released under the same MIT License as the software. Attribution to "ETHSecurity Intelligence" with a link to the repository is appreciated.

## Corrections

If you are the author of quoted content and want a quotation corrected or put in context, use the public correction form on the relevant dossier or the [evidence correction issue template](.github/ISSUE_TEMPLATE/evidence-correction.yml).
