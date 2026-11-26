import { publish } from "@/research/publish";

const { problems } = await publish({ dryRun: process.argv.includes("--dry-run") });
process.exit(problems.length ? 2 : 0);
