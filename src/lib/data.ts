import "server-only";
import raw from "../../data/cases.json";
import type { Case } from "./format";

export { formatFine, formatMonth, shortLaw, type Case } from "./format";

type CasesFile = {
  source: string;
  sourceUrl: string;
  updatedAt: string;
  months: string[];
  cases: Case[];
};

export const dataset = raw as unknown as CasesFile;
export const cases = dataset.cases;
export const caseById = new Map(cases.map((c) => [c.id, c]));
