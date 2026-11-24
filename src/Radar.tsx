import { useState } from "react";
import {
  Radar as RadarIcon,
  Globe2,
  Activity,
  ArrowUpRight,
  ScanLine,
  Search,
} from "lucide-react";
const extensions = ["com", "ai", "io", "kr"];
async function json(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw Error();
  return r.json();
}
export default function Radar() {
  const [name, setName] = useState("starteobu"),
    [searched, setSearched] = useState(""),
    [states, setStates] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState("AI agent"),
    [market, setMarket] = useState<{
      hits: { title: string; url: string }[] | null;
      views: number[] | null;
      term: string;
    }>(),
    [loading, setLoading] = useState(false);
  async function scan(n: string) {
    n = n.trim().toLowerCase();
    if (busy || !n) return;
    setBusy(true);
    setSearched(n);
    setStates(extensions.map(() => "조회 중"));
    await Promise.all(
      extensions.map(async (ext, i) => {
        let status = "확인 불가";
        try {
          const r = await fetch("https://rdap.org/domain/" + n + "." + ext, {
            signal: AbortSignal.timeout(8500),
          });
          if (r.status === 404) status = "미등록";
          if (r.status === 200) status = "등록됨";
        } catch {}
        setStates((old) => old.map((v, j) => (i === j ? status : v)));
      }),
    );
    setBusy(false);
  }
  async function demand() {
    const term = keyword.trim();
    if (!term || loading) return;
    setLoading(true);
    const end = new Date(Date.now() - 2 * 86400000),
      start = new Date(+end - 13 * 86400000),
      fmt = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");
    const [hn, wiki] = await Promise.allSettled([
      json(
        "https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=3&query=" +
          encodeURIComponent(term),
      ),
      json(
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/" +
          encodeURIComponent(
            (term[0].toUpperCase() + term.slice(1)).replaceAll(" ", "_"),
          ) +
          "/daily/" +
          fmt(start) +
          "/" +
          fmt(end),
      ),
    ]);
    setMarket({
      term,
      hits:
        hn.status === "fulfilled"
          ? hn.value.hits.map((h: { title: string; objectID: string }) => ({
              title: h.title,
              url:
                "https://news.ycombinator.com/item?id=" +
                encodeURIComponent(h.objectID),
            }))
          : null,
      views:
        wiki.status === "fulfilled"
          ? wiki.value.items.map((v: { views: number }) => v.views)
          : null,
    });
    setLoading(false);
  }
  return (
    <section id="radar" tabIndex={-1} className="panel radar">
      <div className="panelHead">
        <span className="iconBox teal">
          <RadarIcon />
        </span>
        <h2>도메인·시장 조회</h2>
      </div>
      <div className="radarScene" aria-hidden="true">
        <small>N</small>
        <div className="scope">
          <i />
          <b />
          <em />
        </div>
        <span>W</span>
        <span>E</span>
      </div>
      <div className="tool">
        <h3>
          <Globe2 />
          브랜드 도메인 탐색
        </h3>
        <p>브랜드명의 도메인 등록 여부를 확인하세요.</p>
        <form
          className="inputAction"
          onSubmit={(e) => {
            e.preventDefault();
            scan(name);
          }}
        >
          <input
            aria-label="도메인 브랜드명"
            required
            pattern="[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button disabled={busy}>
            <ScanLine size={15} />
            {busy ? "조회 중" : "조회"}
          </button>
        </form>
        <div className="chips small">
          {["starteobu", "stareobu", "upstart", "petcareai"].map((n) => (
            <button
              key={n}
              disabled={busy}
              onClick={() => {
                setName(n);
                scan(n);
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="domains">
          {extensions.map((ext, i) => (
            <div key={ext}>
              <span>.{ext}</span>
              <small
                className={states[i] === "미등록" ? "available" : ""}
                title={searched}
              >
                {states[i] || "조회 대기"}
              </small>
            </div>
          ))}
        </div>
      </div>
      <div className="tool market">
        <h3>
          <Activity />
          글로벌 시장 수요
        </h3>
        <p>키워드의 글로벌 논의와 관심도를 살펴보세요.</p>
        <form
          className="inputAction"
          onSubmit={(e) => {
            e.preventDefault();
            demand();
          }}
        >
          <input
            required
            value={keyword}
            aria-label="시장 키워드"
            onChange={(e) => setKeyword(e.target.value)}
          />
          <button disabled={loading}>
            <Search size={14} />
            {loading ? "조회 중" : "탐색"}
          </button>
        </form>
        {market && (
          <div className="marketResults">
            <b>{market.term}</b>
            <h4>Hacker News 논의</h4>
            {market.hits?.map((h) => (
              <a key={h.url} href={h.url} target="_blank" rel="noreferrer">
                {h.title}
                <ArrowUpRight size={12} />
              </a>
            ))}
            {!market.hits?.length && (
              <p>{market.hits ? "검색 결과 없음" : "연결할 수 없습니다."}</p>
            )}
            <h4>영문 위키백과 · 최근 14일 조회수</h4>
            {market.views ? (
              <>
                <div className="bars">
                  {market.views.map((v, i) => (
                    <i
                      title={String(v)}
                      key={i}
                      style={{
                        height: (100 * v) / Math.max(1, ...market.views!) + "%",
                      }}
                    />
                  ))}
                </div>
                <p>
                  합계{" "}
                  {market.views.reduce((a, b) => a + b, 0).toLocaleString()}회
                </p>
              </>
            ) : (
              <p>해당 문서의 조회수 자료가 없습니다.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
