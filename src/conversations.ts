import { useEffect, useState } from "react";
import type { Source } from "./types";
export interface Turn {
  q: string;
  text: string;
  refs: Source[];
}
export interface Conversation {
  id: string;
  turns: Turn[];
  updatedAt: number;
  revision: number;
}
export type LoginProvider = "github" | "google";
const key = "start-eobu-conversations-v1";
export const accountApi = new URL(
  "api/",
  new URL(import.meta.env.BASE_URL, location.href),
).href;
async function request(path: string, options?: RequestInit) {
  const response = await fetch(accountApi + path, {
    signal: AbortSignal.timeout(10000),
    ...options,
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error(String(response.status));
  return response.json();
}
function readLocal(): Conversation[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}
export function useConversations() {
  const [guest, setGuest] = useState(readLocal);
  const [cloud, setCloud] = useState<Conversation[]>([]);
  const [account, setAccount] = useState<{
    login: string;
    provider: LoginProvider;
  } | null>(null);
  const [providers, setProviders] = useState<LoginProvider[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Conversation | null>(null);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(
    Boolean(import.meta.env.VITE_ACCOUNT_SYNC),
  );

  useEffect(() => {
    let active = true;
    async function connect() {
      try {
        const session = await request("session");
        if (!active || session.enabled !== true) return;
        setProviders(
          Array.isArray(session.providers)
            ? session.providers.filter(
                (provider: unknown) =>
                  provider === "google" || provider === "github",
              )
            : ["github"],
        );
        if (session.login) {
          const items = await request("conversations");
          if (active) {
            setCloud(items);
            setAccount({
              login: session.login,
              provider: session.provider === "google" ? "google" : "github",
            });
          }
        }
      } catch {
        if (active && import.meta.env.VITE_ACCOUNT_SYNC)
          setError("계정 연결 상태를 확인할 수 없습니다.");
      } finally {
        if (active) setConnecting(false);
      }
    }
    void connect();
    const sync = (event: StorageEvent) => {
      if (event.key === key) setGuest(readLocal());
    };
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      window.removeEventListener("storage", sync);
    };
  }, []);

  function merge(list: Conversation[], item: Conversation) {
    return [item, ...list.filter((entry) => entry.id !== item.id)].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }
  async function save(item: Conversation) {
    setError("");
    if (!account) {
      const next = merge(readLocal(), item);
      setGuest(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        setPending(item);
        setError("브라우저에 대화를 저장하지 못했습니다.");
        return item;
      }
      setPending(null);
      return item;
    }
    setCloud((list) => merge(list, item));
    setSaving(true);
    try {
      const send = (entry: Conversation) =>
        request("conversations/" + entry.id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
      let saved: Conversation;
      try {
        saved = await send(item);
      } catch (cause) {
        if (!(cause instanceof Error) || cause.message !== "409") throw cause;
        const remote: Conversation[] = await request("conversations");
        const onServer = remote.find((entry) => entry.id === item.id);
        if (
          onServer &&
          JSON.stringify(onServer.turns) === JSON.stringify(item.turns)
        )
          saved = onServer;
        else {
          saved = await send({ ...item, id: crypto.randomUUID(), revision: 0 });
          setError("다른 기기의 변경이 있어 이 대화를 별도로 저장했습니다.");
        }
        setCloud(merge(remote, saved));
      }
      setCloud((list) => merge(list, saved));
      setPending(null);
      return saved;
    } catch {
      setPending(item);
      setError("계정에 저장하지 못했습니다. 다시 저장해 주세요.");
      return item;
    } finally {
      setSaving(false);
    }
  }
  async function logout() {
    await request("logout", { method: "POST" });
    setAccount(null);
    setCloud([]);
    setError("");
  }
  return {
    items: account ? cloud : guest,
    account,
    available: providers.length > 0,
    providers,
    save,
    pending,
    saving,
    connecting,
    error,
    logout,
  };
}
