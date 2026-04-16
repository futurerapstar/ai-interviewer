"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import type { AnswerResponse, StartResponse } from "@/types";

type ChatItem =
  | { id: string; kind: "question"; content: string }
  | { id: string; kind: "answer"; content: string }
  | { id: string; kind: "evaluation"; content: AnswerResponse };

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSubmit = useMemo(() => {
    return !loading && !!sessionId && !!answer.trim();
  }, [loading, sessionId, answer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, loading, error]);

  async function startInterview() {
    setLoading(true);
    setError(null);
    setAnswer("");
    setItems([]);

    try {
      const res = await fetch("/api/start", { method: "POST" });
      const data = (await res.json()) as StartResponse | { error?: string };
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error || "start failed");
      }

      setSessionId((data as StartResponse).sessionId);
      setItems([
        {
          id: crypto.randomUUID(),
          kind: "question",
          content: (data as StartResponse).question,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setSessionId(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void startInterview();
  }, []);

  async function submitAnswer() {
    if (!sessionId) return;
    const userText = answer.trim();
    if (!userText) return;

    setLoading(true);
    setError(null);

    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "answer", content: userText },
    ]);
    setAnswer("");

    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, answer: userText }),
      });

      const data = (await res.json()) as AnswerResponse | { error?: string };
      if (!res.ok) {
        throw new Error((data as { error?: string })?.error || "answer failed");
      }

      const evaluation = data as AnswerResponse;
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "evaluation", content: evaluation },
        {
          id: crypto.randomUUID(),
          kind: "question",
          content: evaluation.nextQuestion,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitAnswer();
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex flex-col">
            <h1 className="text-base font-semibold">AI 面试考官</h1>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              默认岗位：前端工程师
            </p>
          </div>

          <button
            type="button"
            onClick={() => void startInterview()}
            disabled={loading}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            重设面试
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="flex flex-1 flex-col gap-3">
          {items.map((it) => {
            if (it.kind === "question") {
              return (
                <div
                  key={it.id}
                  className="self-start rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10"
                >
                  <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    面试官
                  </div>
                  <div className="whitespace-pre-wrap">{it.content}</div>
                </div>
              );
            }

            if (it.kind === "answer") {
              return (
                <div
                  key={it.id}
                  className="self-end rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                >
                  <div className="mb-1 text-xs font-medium opacity-80">你</div>
                  <div className="whitespace-pre-wrap">{it.content}</div>
                </div>
              );
            }

            const evaluation = it.content;
            return (
              <div
                key={it.id}
                className="self-start rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-50 dark:ring-emerald-900"
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div className="text-xs font-medium opacity-80">评价</div>
                  <div className="text-xs font-semibold">评分：{evaluation.score}/5</div>
                </div>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap prose-p:my-2 dark:prose-invert">
                  <ReactMarkdown>{evaluation.feedback}</ReactMarkdown>
                </div>
              </div>
            );
          })}

          {loading ? (
            <div className="self-start rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10">
              <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent dark:border-zinc-700 dark:border-t-transparent" />
                <span>AI 正在思考…</span>
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto w-full max-w-3xl px-4 py-4">
          <div className="flex gap-3">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={sessionId ? "输入你的回答（Enter 发送，Shift+Enter 换行）" : "初始化中…"}
              disabled={loading || !sessionId}
              rows={3}
              className="flex-1 resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:focus:ring-white/10"
            />
            <button
              type="button"
              onClick={() => void submitAnswer()}
              disabled={!canSubmit}
              className="h-fit rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              发送
            </button>
          </div>
          <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Session: {sessionId ?? "-"}
          </div>
        </div>
      </footer>
    </div>
  );
}
