export interface Source {
  id: string;
  title: string;
  kind: "grant" | "trend" | "memo";
  category: string;
  org: string;
  summary: string;
  eligibility: string;
  action: string;
  url?: string;
  deadline?: string;
  sample?: boolean;
}
export function timing(s: Source) {
  if (!s.deadline) return "공고별 확인";
  const d = Math.round(
    (Date.parse(s.deadline + "T00:00:00+09:00") -
      Date.parse(
        new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) +
          "T00:00:00+09:00",
      )) /
      86400000,
  );
  return s.deadline + " · " + (d < 0 ? "마감" : d === 0 ? "D-Day" : "D-" + d);
}
