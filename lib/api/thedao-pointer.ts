/** Public API stand-in for live funding, pledges, the vote clock and what-if arithmetic. */
export const THEDAO_HOME = "https://initiatives.thedao.fund/";
export const THEDAO_VOTE = "https://initiatives.thedao.fund/vote";

export function thedaoPointer(officialUrl: string = THEDAO_HOME) {
  return {
    fundingAndVoting: "Published by TheDAO. This API does not copy live raised, pledged, goal or ask figures.",
    officialUrl,
    voteApp: THEDAO_VOTE,
  };
}
