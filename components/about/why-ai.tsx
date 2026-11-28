export const WHY_AI_LINES = [
  "AI only matches public work to initiatives and summarizes sourced research into a short card.",
  "It decides nothing. Scores, rankings and voting advice are never produced.",
  "It never sees your vote. Your ballot and notes stay in this browser.",
  "Every AI summary is labeled as AI and links to the sources it used.",
] as const;

export function WhyAiList({ className }: { className?: string }) {
  return (
    <ul className={className ?? "max-w-[860px] list-disc space-y-1 pl-5 text-sm text-ink-2"}>
      {WHY_AI_LINES.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
