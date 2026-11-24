import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Waves,
  Sparkles,
  Search,
  Menu,
  Pin,
  UserRound,
  Check,
  ArrowUpRight,
  ArrowUp,
  Cpu,
  ChevronDown,
  MessageSquare,
  FileText,
  Plus,
  X,
  BookOpen,
  Radar as RadarIcon,
  Building2,
} from "lucide-react";
import { Source, timing } from "./types";
import { useAIEngine } from "./useAIEngine";
import { retrieve } from "./retrieval";
import Radar from "./Radar";
import {
  accountApi,
  useConversations,
  type Conversation,
  type Turn,
} from "./conversations";
import "./style.css";
const historyPinKey = "eobu-history-pinned";
const compactHistoryQuery = "(max-width: 760px)";

function readHistoryPin() {
  try {
    return localStorage.getItem(historyPinKey) !== "false";
  } catch {
    return true;
  }
}

const prompts = [
  {
    icon: Building2,
    title: "지원사업 찾기",
    question: "예비창업자가 신청할 수 있는 지원사업과 자격을 알려줘.",
  },
  {
    icon: FileText,
    title: "사업계획서 준비",
    question: "초기 고객을 검증하는 사업계획서에 어떤 내용을 담아야 해?",
  },
  {
    icon: Sparkles,
    title: "시장 기회 살펴보기",
    question: "AI 에이전트와 관련된 글로벌 트렌드를 정리해줘.",
  },
];
function Logo() {
  return (
    <svg
      width="37"
      height="40"
      viewBox="0 0 40 42"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M25 4v22c0 14-23 16-23-1l1-8 6 8-4-1c1 11 17 12 17-1V7z"
        fill="#f7c564"
      />
      <path
        d="m29 0 2.7 7.5 7.3 2.6-7.3 2.6L29 20l-2.7-7.3-7.3-2.6 7.3-2.6z"
        fill="#ffdb86"
      />
    </svg>
  );
}
function App() {
  const [base, setBase] = useState<Source[]>([]),
    [dataError, setDataError] = useState(false),
    [memos, setMemos] = useState<Source[]>(() => {
      try {
        const v = JSON.parse(localStorage.getItem("eobu-memos") || "[]");
        return Array.isArray(v)
          ? v.filter((m) => m?.kind === "memo" && typeof m.summary === "string")
          : [];
      } catch {
        return [];
      }
    });
  const [selected, setSelected] = useState<string[]>([]),
    [tab, setTab] = useState<Source["kind"] | "selected">("grant"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("전체"),
    [note, setNote] = useState(""),
    [detail, setDetail] = useState<Source>(),
    [engineMenu, setEngineMenu] = useState(false);
  const [q, setQ] = useState(""),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<Turn[]>([]),
    [thread, setThread] = useState<Conversation>(),
    [historyQuery, setHistoryQuery] = useState(""),
    [accountError, setAccountError] = useState(() => {
      const url = new URL(location.href);
      if (url.searchParams.get("login") !== "failed") return "";
      url.searchParams.delete("login");
      window.history.replaceState(null, "", url);
      return "로그인을 완료하지 못했습니다.";
    }),
    [storageError, setStorageError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyPinned, setHistoryPinned] = useState(readHistoryPin);
  const [historyOpen, setHistoryOpen] = useState(historyPinned);
  const [compactHistory, setCompactHistory] = useState(
    () => window.matchMedia(compactHistoryQuery).matches,
  );
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const historyVisible = compactHistory ? historyDrawerOpen : historyOpen;
  const chat = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    drawer = useRef<HTMLDialogElement>(null),
    radar = useRef<HTMLDialogElement>(null),
    historyDrawer = useRef<HTMLDialogElement>(null),
    historyMenu = useRef<HTMLButtonElement>(null),
    accountDialog = useRef<HTMLDialogElement>(null),
    engine = useAIEngine();
  const conversations = useConversations();
  const locked =
    busy ||
    conversations.connecting ||
    conversations.saving ||
    !!conversations.pending;
  const historyMatches = conversations.items.filter(({ turns }) => {
    const words = historyQuery.toLocaleLowerCase().trim().split(/\s+/);
    return words.every((word) =>
      turns.some(({ q, text }) =>
        (q + " " + text).toLocaleLowerCase().includes(word),
      ),
    );
  });
  function showConversation(item?: Conversation) {
    setThread(item);
    setHistory(item?.turns ?? []);
    setQ("");
    setDetail(undefined);
    setHistoryDrawerOpen(false);
    if (!historyPinned) {
      setHistoryOpen(false);
      if (document.activeElement?.closest(".historySidebar")) {
        historyMenu.current?.focus();
      }
    }
    requestAnimationFrame(() => {
      if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
    });
  }
  function closeHistory() {
    if (compactHistory) {
      setHistoryDrawerOpen(false);
    } else {
      setHistoryOpen(false);
      historyMenu.current?.focus();
    }
  }
  function toggleHistoryPin() {
    const pinned = !historyPinned;
    setHistoryPinned(pinned);
    try {
      localStorage.setItem(historyPinKey, String(pinned));
    } catch {
      // Keep the preference for this session if browser storage is unavailable.
    }
  }
  useEffect(() => {
    const query = window.matchMedia(compactHistoryQuery);
    function update() {
      setCompactHistory(query.matches);
      setHistoryDrawerOpen(false);
    }
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const drawer = historyDrawer.current;
    if (historyDrawerOpen && drawer && !drawer.open) drawer.showModal();
    if (!historyDrawerOpen && drawer?.open) drawer.close();
  }, [compactHistory, historyDrawerOpen]);
  useEffect(() => {
    Promise.all(
      ["grants", "trends"].map((n) =>
        fetch(import.meta.env.BASE_URL + "data/" + n + ".json").then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        }),
      ),
    )
      .then((rows) => setBase(rows.flat()))
      .catch(() => setDataError(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (detail) dialog.current?.showModal();
    else dialog.current?.close();
  }, [detail]);
  const sources = [...base, ...memos],
    picked = sources.filter((s) => selected.includes(s.id));
  const list = sources.filter(
    (s) =>
      (tab === "selected" ? selected.includes(s.id) : s.kind === tab) &&
      (filter === "전체" || s.category === filter) &&
      [s.title, s.summary, s.org]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function toggle(id: string) {
    setSelected((old) =>
      old.includes(id) ? old.filter((k) => k !== id) : [...old, id],
    );
  }
  function addMemo(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    const s: Source = {
      kind: "memo",
      category: "아이디어",
      eligibility: "",
      id: crypto.randomUUID(),
      org: "내 메모",
      title: note.trim().split("\n")[0].slice(0, 40),
      summary: note.trim(),
      action: "목표 고객과 검증할 가설을 구체화하세요.",
    };
    const next = [...memos, s];
    setMemos(next);
    try {
      localStorage.setItem("eobu-memos", JSON.stringify(next));
    } catch {
      setStorageError(true);
    }
    setSelected([...selected, s.id]);
    setNote("");
    setSearch("");
    drawer.current?.close();
  }
  async function ask(question: string) {
    question = question.trim();
    if (!question || locked || loading) return;
    const previous = history.at(-1);
    const followUp =
      previous &&
      /^(그중|그 중|그럼|그러면|이 중|이건|위 |마감|신청 방법|자격은|더 자세히)/.test(
        question,
      );
    const pool = picked.length
      ? picked
      : followUp && previous.refs.length
        ? previous.refs
        : sources;
    const refs = retrieve(
      followUp ? previous.q + " " + question : question,
      pool,
    );
    setBusy(true);
    setQ("");
    const next = [...history, { q: question, text: "", refs }];
    setHistory(next);
    try {
      await engine.answer(
        question,
        refs,
        (text) => {
          next[next.length - 1] = { q: question, text, refs };
          setHistory([...next]);
        },
        history.slice(-3),
      );
      setThread(
        await conversations.save({
          id: thread?.id ?? crypto.randomUUID(),
          revision: thread?.revision ?? 0,
          turns: next,
          updatedAt: Date.now(),
        }),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      chat.current &&
      chat.current.scrollHeight -
        chat.current.scrollTop -
        chat.current.clientHeight <
        200
    )
      chat.current.scrollTop = chat.current.scrollHeight;
  }, [history]);
  const modeLabel =
    engine.mode === "local"
      ? "로컬 GPU 연결됨"
      : engine.mode === "browser"
        ? engine.browserModel === "quality"
          ? "브라우저 AI · Qwen3-4B"
          : "브라우저 AI · Gemma3-1B"
        : "즉시 브리핑 모드";
  const historyContents = (
    <>
      <div className="dialogHead">
        <h2 id="history-title">대화 기록</h2>
        <div className="historyActions">
          {!compactHistory && (
            <button
              className="newThread"
              type="button"
              aria-pressed={historyPinned}
              onClick={toggleHistoryPin}
            >
              <Pin size={15} />
              고정
            </button>
          )}
          <button
            type="button"
            aria-label="대화 기록 닫기"
            onClick={closeHistory}
          >
            <X size={18} />
          </button>
        </div>
      </div>
      <p className="historyHint">
        {conversations.account
          ? "계정에 저장된 대화"
          : "이 브라우저에 저장된 대화"}
      </p>
      <button
        className="newThread historyNewThread"
        type="button"
        disabled={locked || (!history.length && !q)}
        onClick={() => showConversation()}
      >
        <Plus size={16} />새 대화
      </button>
      <label className="search">
        <Search size={16} />
        <input
          aria-label="대화 검색"
          placeholder="질문과 답변 검색"
          value={historyQuery}
          onChange={(event) => setHistoryQuery(event.target.value)}
        />
      </label>
      <div className="historyList">
        {historyMatches.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={locked}
            aria-current={thread?.id === item.id ? "true" : undefined}
            onClick={() => showConversation(item)}
          >
            <strong>{item.turns[0]?.q.slice(0, 100)}</strong>
            <small>
              {new Date(item.updatedAt).toLocaleString("ko-KR")} · 질문{" "}
              {item.turns.length}개
            </small>
          </button>
        ))}
        {!historyMatches.length && (
          <p className="historyHint">
            {conversations.connecting
              ? "대화 기록을 불러오는 중…"
              : historyQuery.trim()
                ? "검색 결과가 없습니다."
                : "저장된 대화가 없습니다."}
          </p>
        )}
      </div>
    </>
  );
  return (
    <>
      <header className="top">
        <div className="navinner">
          <div className="navStart">
            <button
              ref={historyMenu}
              className="newThread historyMenu"
              type="button"
              aria-label="대화 기록"
              aria-controls="conversation-history"
              aria-expanded={historyVisible}
              aria-haspopup={compactHistory ? "dialog" : undefined}
              onClick={() => {
                if (compactHistory) setHistoryDrawerOpen(!historyDrawerOpen);
                else setHistoryOpen(!historyOpen);
              }}
            >
              <Menu size={20} />
            </button>
            <a className="brand" href="./">
              <Logo />
              <strong>스타어부</strong>
              <span>Start-Eobu</span>
            </a>
          </div>
          <div className="navActions">
            <div className="engineWrap">
              <button
                className="status"
                aria-expanded={engineMenu}
                onClick={() => setEngineMenu(!engineMenu)}
              >
                <i />
                {engine.progress !== null
                  ? (engine.browserModel === "quality" ? "Qwen3" : "Gemma3") +
                    " 준비 " +
                    engine.progress +
                    "%"
                  : modeLabel}
                <ChevronDown size={13} />
              </button>
              {engineMenu && (
                <div className="popover">
                  <b>
                    {engine.mode === "local"
                      ? "로컬 고성능 AI 연결됨 (Ollama)"
                      : modeLabel}
                  </b>
                  <p>브라우저 AI는 처음 실행할 때 모델을 내려받습니다.</p>
                  {engine.localModel && (
                    <button
                      disabled={
                        busy ||
                        engine.progress !== null ||
                        engine.mode === "local"
                      }
                      onClick={() => {
                        engine.useLocal();
                        setEngineMenu(false);
                      }}
                    >
                      <Cpu size={15} />
                      로컬 AI · {engine.localModel}
                    </button>
                  )}
                  {(["quality", "light"] as const).map((choice) => (
                    <button
                      key={choice}
                      disabled={
                        busy ||
                        engine.progress !== null ||
                        (engine.mode === "browser" &&
                          engine.browserModel === choice)
                      }
                      onClick={() => {
                        engine.enable(choice);
                        setEngineMenu(false);
                      }}
                    >
                      <Cpu size={15} />
                      {choice === "quality"
                        ? "고품질 브라우저 AI (Qwen3-4B, ~2.7GB)"
                        : "초경량 브라우저 AI (Gemma3-1B, ~800MB)"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="newThread headerAction"
              aria-label={conversations.account ? "계정" : "로그인"}
              onClick={() => accountDialog.current?.showModal()}
            >
              <UserRound size={16} />
              <span>{conversations.account ? "계정" : "로그인"}</span>
            </button>
          </div>
        </div>
      </header>
      {compactHistory ? (
        <dialog
          id="conversation-history"
          className="historyPanel historyDrawer"
          ref={historyDrawer}
          aria-labelledby="history-title"
          onCancel={(event) => {
            event.preventDefault();
            closeHistory();
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const { left, right, top, bottom } =
              event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < left ||
              event.clientX > right ||
              event.clientY < top ||
              event.clientY > bottom
            ) {
              closeHistory();
            }
          }}
        >
          {historyContents}
        </dialog>
      ) : (
        <aside
          id="conversation-history"
          className="historyPanel historySidebar"
          aria-labelledby="history-title"
          hidden={!historyVisible}
        >
          {historyContents}
        </aside>
      )}
      <main className={"agent " + (!history.length ? "agentEmpty" : "")}>
        <div className="agentScroll" ref={chat}>
          {!history.length ? (
            <div className="agentIntro">
              <div className="agentMark">
                <Logo />
              </div>
              <h1>
                어떤 창업 기회를
                <br />
                찾고 있나요?
              </h1>
              <p>지원사업, 시장 트렌드, 아이디어 검증을 물어보세요.</p>
            </div>
          ) : (
            <div className="agentLog">
              {history.map((h, i) => (
                <article className="agentTurn" key={i}>
                  <div className="question">{h.q}</div>
                  <div className="agentReply">
                    <span className="replyBrand">
                      <Sparkles size={15} />
                      스타어부
                    </span>
                    <p>
                      {h.text
                        ? h.text.split(/(\[출처 \d+\])/).map((v, j) => {
                            const match = v.match(/^\[출처 (\d+)\]$/);
                            const ref = match && h.refs[Number(match[1]) - 1];
                            return ref ? (
                              <button
                                className="cite"
                                key={j}
                                onClick={() => setDetail(ref)}
                              >
                                {v}
                              </button>
                            ) : (
                              v
                            );
                          })
                        : "관련 자료를 살펴보고 있어요…"}
                    </p>
                    {!!h.refs.length && (
                      <div className="replySources" aria-label="답변 출처">
                        {h.refs.map((source) => (
                          <button
                            key={source.id}
                            onClick={() => setDetail(source)}
                          >
                            <BookOpen size={13} />
                            {source.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="agentDock">
          {(conversations.error || conversations.saving || accountError) && (
            <p className="agentStatus" role="status">
              {conversations.saving
                ? "대화 저장 중…"
                : conversations.error || accountError}
              {conversations.pending && !conversations.saving && (
                <button
                  className="historyRetry"
                  onClick={async () => {
                    if (conversations.pending)
                      setThread(
                        await conversations.save(conversations.pending),
                      );
                  }}
                >
                  다시 저장
                </button>
              )}
            </p>
          )}
          {(engine.notice || dataError || storageError) && (
            <p className="agentStatus" role="status">
              {engine.notice} {dataError && "일부 자료를 불러오지 못했습니다."}{" "}
              {storageError && "이 기기에 메모를 저장하지 못했습니다."}
            </p>
          )}
          {engine.progress !== null && (
            <label className="agentStatus">
              브라우저 모델 준비 {engine.progress}%{" "}
              <progress value={engine.progress} max={100} />
            </label>
          )}
          <form
            className="composer agentComposer"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(q);
            }}
          >
            <textarea
              aria-label="AI 질문"
              maxLength={6000}
              rows={2}
              placeholder="창업 아이디어나 궁금한 점을 적어 주세요"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault();
                  void ask(q);
                }
              }}
            />
            <div className="composerActions">
              <button
                type="button"
                className="composerTool"
                onClick={() => drawer.current?.showModal()}
              >
                <BookOpen size={16} />
                자료·메모{picked.length > 0 && <span>{picked.length}</span>}
              </button>
              <button
                type="button"
                className="composerTool"
                onClick={() => radar.current?.showModal()}
              >
                <RadarIcon size={16} />
                도메인·시장
              </button>
              <button
                className="sendQuestion"
                aria-label="질문 보내기"
                disabled={!q.trim() || locked || loading}
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
          {!history.length && (
            <div className="agentSuggestions">
              {prompts.map(({ icon: Icon, title, question }) => (
                <button
                  type="button"
                  key={title}
                  disabled={loading}
                  onClick={() => void ask(question)}
                  title={question}
                >
                  <Icon size={16} />
                  {title}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
      <dialog
        className="agentDialog"
        ref={accountDialog}
        aria-labelledby="account-title"
      >
        <div className="dialogHead">
          <h2 id="account-title">
            {conversations.account ? "내 계정" : "로그인"}
          </h2>
          <button
            aria-label="계정 창 닫기"
            onClick={() => accountDialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        {conversations.account ? (
          <>
            <p>
              {conversations.account.login} ·{" "}
              {conversations.account.provider === "google"
                ? "Google"
                : "GitHub"}{" "}
              계정에 새 대화가 저장됩니다.
            </p>
            <button
              className="historyRetry"
              disabled={locked}
              onClick={async () => {
                try {
                  await conversations.logout();
                  showConversation();
                  accountDialog.current?.close();
                  setAccountError("");
                } catch {
                  setAccountError(
                    "로그아웃에 실패했습니다. 다시 시도해 주세요.",
                  );
                }
              }}
            >
              로그아웃
            </button>
          </>
        ) : (
          <>
            <p>
              로그인하면 이후 대화를 계정에 저장해 다른 기기에서도 볼 수
              있습니다. 기존 기록은 이 브라우저에서 계속 확인할 수 있습니다.
            </p>
            {conversations.available && !locked ? (
              <div className="loginProviders">
                {conversations.providers.map((provider) => (
                  <a
                    key={provider}
                    className="historyRetry"
                    href={accountApi + "login/" + provider}
                  >
                    {provider === "google" ? "Google" : "GitHub"}로 로그인{" "}
                    <ArrowUpRight size={15} />
                  </a>
                ))}
              </div>
            ) : (
              <p>
                {conversations.connecting
                  ? "계정 연결 확인 중…"
                  : conversations.available
                    ? "대화 저장을 마치면 로그인할 수 있습니다."
                    : "이 주소에서는 브라우저에 대화가 저장됩니다. 계정 로그인은 Cloudflare 배포에서 제공됩니다."}
              </p>
            )}
          </>
        )}
      </dialog>
      <dialog
        className="agentDialog"
        ref={drawer}
        aria-labelledby="source-dialog-title"
      >
        <div className="dialogHead">
          <h2 id="source-dialog-title">자료·메모</h2>
          <button
            aria-label="자료 닫기"
            onClick={() => drawer.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sourceBody">
          <p className="panelHint">
            자동으로 관련 자료를 찾습니다. 직접 체크하면 해당 자료에서만 찾아요.
          </p>
          <div className="tabs" role="group" aria-label="자료 종류">
            {(["grant", "trend", "memo", "selected"] as const).map((v, i) => (
              <button
                aria-pressed={tab === v}
                className={tab === v ? "active" : ""}
                key={v}
                onClick={() => {
                  setTab(v);
                  setSearch("");
                  setFilter("전체");
                }}
              >
                {["지원사업", "트렌드", "내 메모", "선택 " + picked.length][i]}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={16} />
            <input
              placeholder="자료 이름이나 키워드로 검색"
              aria-label="자료 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {tab === "memo" ? (
            <form className="memo" onSubmit={addMemo}>
              <textarea
                required
                aria-label="사업 아이디어"
                placeholder="사업 아이디어를 기록하세요"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button>
                <Plus size={14} />
                메모 저장하고 선택
              </button>
            </form>
          ) : tab === "grant" ? (
            <div className="chips">
              {(tab === "grant"
                ? ["전체", "예비창업", "초기창업", "R&D·바우처"]
                : ["전체", "글로벌 트렌드"]
              ).map((f) => (
                <button
                  aria-pressed={filter === f}
                  className={filter === f ? "chosen" : ""}
                  onClick={() => setFilter(f)}
                  key={f}
                >
                  {f}
                </button>
              ))}
            </div>
          ) : null}
          <div className="listCaption">
            <span>
              {tab === "grant"
                ? "지원사업"
                : tab === "trend"
                  ? "트렌드"
                  : tab === "memo"
                    ? "메모"
                    : "선택한 자료"}{" "}
              {list.length}개
            </span>
            <span>
              <Check size={12} />
              {picked.length}개 선택
            </span>
          </div>
          <div className="sourceList">
            {list.map((s) => (
              <article
                key={s.id}
                className={
                  "sourceCard " + (selected.includes(s.id) ? "selected" : "")
                }
              >
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="checkmark">
                    <Check size={12} />
                  </span>
                  <span
                    className={
                      "tag c" +
                      (s.category === "예비창업"
                        ? 0
                        : s.category === "초기창업"
                          ? 1
                          : 2)
                    }
                  >
                    {s.category}
                  </span>
                  <strong>{s.title}</strong>
                  <small>
                    <Building2 size={12} />
                    {s.org}
                    {s.sample && " · 예시 자료"}
                  </small>
                </label>
                <button
                  className="sourceDetail"
                  aria-label={s.title + " 상세 보기"}
                  onClick={() => setDetail(s)}
                >
                  <ArrowUpRight size={14} />
                </button>
              </article>
            ))}
            {!list.length && (
              <p>
                {search
                  ? "검색 조건에 맞는 자료가 없어요."
                  : tab === "selected"
                    ? "지원사업이나 트렌드에서 자료를 체크해 주세요."
                    : tab === "memo"
                      ? "저장한 메모가 여기에 표시돼요."
                      : "자료가 없습니다."}
              </p>
            )}
          </div>
        </div>
      </dialog>
      <dialog
        className="agentDialog radarDialog"
        ref={radar}
        aria-label="도메인·시장 조회"
      >
        <div className="dialogHead">
          <button aria-label="조회 닫기" onClick={() => radar.current?.close()}>
            <X size={20} />
          </button>
        </div>
        <Radar />
      </dialog>
      <dialog
        ref={dialog}
        onCancel={() => setDetail(undefined)}
        onClick={(e) => {
          if (e.target === dialog.current) setDetail(undefined);
        }}
      >
        {detail && (
          <>
            <div className="dialogHead">
              <span className="iconBox blue">
                <FileText />
              </span>
              <button aria-label="닫기" onClick={() => setDetail(undefined)}>
                <X />
              </button>
            </div>
            <small>
              {detail.category} · {detail.org}
            </small>
            <h2>{detail.title}</h2>
            <p>{detail.summary}</p>
            {detail.eligibility && <p>{detail.eligibility}</p>}
            <p>{detail.action}</p>
            {detail.kind === "grant" && <p>마감 일정 · {timing(detail)}</p>}
            {detail.sample && (
              <small>
                탐색용 예시 자료입니다. 신청 조건과 일정은 공식 공고에서
                확인하세요.
              </small>
            )}
            {detail.url && /^https?:\/\//i.test(detail.url) && (
              <a href={detail.url} target="_blank" rel="noreferrer">
                출처 열기 <ArrowUpRight size={15} />
              </a>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
