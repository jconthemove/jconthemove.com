// Dispatch adapter — wraps crew-suggestions for the pipeline's dispatch
// step. This is intentionally thin: the real offer queue + locks + state
// machine live in the dispatch task (#172). Here we only surface the
// "who would we send?" recommendation using existing workload scoring.
import { crewSuggestionService } from "../../services/crew-suggestions";

export interface DispatchChoice {
  recommendedCrewSize: number;
  suggestedCrewIds: string[];
  primaryCrewId: string | null;
  note: string;
}

const CREW_SIZE_BY_SERVICE: Record<string, number> = {
  moving: 3,
  junk_removal: 2,
  demolition: 3,
  handyman: 1,
  cleaning: 2,
  move_cleaning: 2,
  lawn_care: 1,
  snow_removal: 1,
  window_cleaning: 1,
  trash_valet: 1,
  delivery: 2,
  labor: 2,
};

export async function pickCrew(items: { serviceCode: string }[]): Promise<DispatchChoice> {
  const crewSize = items.reduce((max, i) => {
    const n = CREW_SIZE_BY_SERVICE[i.serviceCode] ?? 1;
    return n > max ? n : max;
  }, 1);

  // Rank available approved employees by active workload + experience.
  // The fine-grained scoring per job type lives in crewSuggestionService;
  // without a persisted job row we use the raw stats + a zero special-items
  // flag, then pick the top N by score.
  let suggestions: Awaited<ReturnType<typeof crewSuggestionService.getEmployeesWithStats>> = [];
  try {
    suggestions = await crewSuggestionService.getEmployeesWithStats();
  } catch (e) {
    return {
      recommendedCrewSize: crewSize,
      suggestedCrewIds: [],
      primaryCrewId: null,
      note: "crew roster unavailable",
    };
  }

  const scored = suggestions.map((emp) => {
    const { score } = crewSuggestionService.calculateEmployeeScore(emp, "moving", false);
    return { id: emp.id, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const picks = scored.slice(0, crewSize).map((s) => s.id);
  return {
    recommendedCrewSize: crewSize,
    suggestedCrewIds: picks,
    primaryCrewId: picks[0] ?? null,
    note: `${scored.length} workers considered, crew size ${crewSize}`,
  };
}
