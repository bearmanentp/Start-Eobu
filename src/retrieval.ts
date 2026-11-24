import { Source, timing } from "./types";
function terms(text: string) {
  return (text.toLowerCase().match(/[가-힣]+|[a-z0-9]+/g) || []).flatMap(
    (w) => [
      w,
      ...(/[가-힣]/.test(w)
        ? Array.from({ length: w.length - 1 }, (_, i) => w.slice(i, i + 2))
        : []),
    ],
  );
}
export function retrieve(question: string, sources: Source[]) {
  const kind = /트렌드|시장 기회|기술 동향/.test(question)
    ? "trend"
    : /지원사업|공고|마감|신청|자격|사업계획서/.test(question)
      ? "grant"
      : null;
  const relevant = kind
    ? sources.filter((s) => s.kind === kind || s.kind === "memo")
    : sources;
  const pool = relevant.length ? relevant : sources;
  const docs = pool.map((s) =>
    terms([s.title, s.category, s.summary, s.eligibility, s.action].join(" ")),
  );
  const average = docs.reduce((n, d) => n + d.length, 0) / docs.length || 1;
  const query = [...new Set(terms(question))];
  return pool
    .map((s, i) => ({
      s,
      score: query.reduce((n, t) => {
        const tf = docs[i].filter((w) => w === t).length,
          df = docs.filter((d) => d.includes(t)).length,
          idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        return (
          n +
          idf *
            ((tf * 2.2) /
              (tf + 1.2 * (0.25 + (0.75 * docs[i].length) / average)) +
              Math.log1p(tf) / Math.sqrt(docs[i].length || 1))
        );
      }, 0),
    }))
    .filter(({ score }) => score > 0 || kind !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => r.s);
}
export function synthesize(q: string, refs: Source[]) {
  if (!refs.length)
    return "관련 자료를 찾지 못했어요. 관심 업종이나 창업 단계를 알려주시면 지원사업과 트렌드에서 다시 찾아볼게요.";
  const memo = refs.find((s) => s.kind === "memo");
  return refs
    .map((s, i) => {
      const prefix = s.title + " [출처 " + (i + 1) + "]\n";
      if (/마감|일정/.test(q)) return prefix + timing(s);
      if (/자격/.test(q)) return prefix + (s.eligibility || s.summary);
      if (/계획서|포인트/.test(q)) return prefix + s.action;
      if (/차별화|결합/.test(q) && s.kind === "trend")
        return (
          prefix +
          (memo ? memo.title + "에 적용할 가설로 검토하세요. " : "") +
          s.summary +
          " " +
          s.action
        );
      return prefix + s.summary + " " + (s.eligibility || s.action);
    })
    .join("\n\n");
}
