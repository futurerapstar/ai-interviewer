"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { experimental_useObject as useObject } from "ai/react";
import { z } from "zod";

import type { AnswerResponse, StartResponse } from "@/types";

type ChatItem =
  | { id: string; kind: "question"; content: string }
  | { id: string; kind: "answer"; content: string }
  | { id: string; kind: "evaluation"; content: AnswerResponse };

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [answer, setAnswer] = useState<string>("");
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [jdText, setJdText] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { submit, object, isLoading, error: objectError, stop } = useObject({
    api: "/api/answer",
    schema: z.object({
      score: z.number().min(1).max(5),
      feedback: z.string(),
      nextQuestion: z.string(),
    }),
    onError: (err) => {
      setError(err.message || "提交回答失败");
    },
    onFinish: ({ object }) => {
      if (object) {
        setItems((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            kind: "evaluation",
            content: {
              score: object.score as 1 | 2 | 3 | 4 | 5,
              feedback: object.feedback || "",
              nextQuestion: object.nextQuestion || "",
            },
          },
          {
            id: crypto.randomUUID(),
            kind: "question",
            content: object.nextQuestion || "",
          },
        ]);
      }
    },
  });

  const isBusy = isStarting || isLoading || isParsingPdf;

  const canSubmit = useMemo(() => {
    return !isBusy && !!sessionId && !!answer.trim();
  }, [isBusy, sessionId, answer]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, isBusy, error, object]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResumeFileName(file.name);

    if (file.type === "application/pdf") {
      setIsParsingPdf(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse-pdf", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "解析 PDF 失败");
        }
        setResumeText(data.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "解析 PDF 时发生未知错误");
        setResumeFileName(null);
        setResumeText("");
      } finally {
        setIsParsingPdf(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setResumeText(e.target?.result as string);
        if (fileInputRef.current) fileInputRef.current.value = "";
      };
      reader.readAsText(file);
    }
  }

  async function startInterview() {
    setIsStarting(true);
    setError(null);
    setAnswer("");
    setItems([]);
    if (isLoading) stop();

    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jdText }),
      });
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
      setIsStarting(false);
    }
  }

  function resetInterview() {
    if (isLoading) stop();
    setSessionId(null);
    setItems([]);
    setAnswer("");
    setError(null);
  }

  function submitAnswer() {
    if (!sessionId) return;
    const userText = answer.trim();
    if (!userText) return;

    setError(null);

    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "answer", content: userText },
    ]);
    setAnswer("");

    submit({ sessionId, answer: userText });
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
              {jdText ? "定制化面试" : "默认岗位：前端工程师"}
            </p>
          </div>

          <button
            type="button"
            onClick={resetInterview}
            disabled={isBusy && !sessionId}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          >
            重设面试
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        {error || objectError ? (
          <div className="rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
            {error || objectError?.message || "发生错误"}
          </div>
        ) : null}

        {!sessionId && items.length === 0 ? (
          <div className="flex flex-col gap-6 rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-zinc-950">
            <div>
              <h2 className="text-lg font-semibold">定制你的面试</h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                上传简历或粘贴岗位要求（JD），AI 面试官将为你量身定制提问。也可以直接跳过，进行通用前端面试。
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">1. 目标岗位描述 (JD) - 可选</label>
                <textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  placeholder="粘贴你要应聘的岗位要求，例如：熟练使用 React 及其生态，熟悉性能优化..."
                  rows={4}
                  className="resize-none rounded-xl border border-black/10 bg-zinc-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-white/10 dark:bg-zinc-900 dark:focus:ring-white/10"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">2. 上传简历 - 可选</label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".pdf,.txt,.md"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsingPdf}
                    className="rounded-xl border border-black/10 bg-zinc-50 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                  >
                    {isParsingPdf ? "正在解析 PDF..." : "选择文件 (PDF/TXT)"}
                  </button>
                  {resumeFileName && !isParsingPdf && (
                    <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      ✓ 已解析 {resumeFileName}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void startInterview()}
              disabled={isBusy}
              className="mt-2 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isStarting ? "正在生成专属面试题..." : "开始面试"}
            </button>
          </div>
        ) : (
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
                  className="self-start rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-50 dark:ring-emerald-900 w-full"
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

            {isLoading && object ? (
              <div className="flex flex-col gap-3 w-full">
                <div className="self-start rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-50 dark:ring-emerald-900 w-full overflow-hidden">
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <div className="text-xs font-medium opacity-80 flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      评价（生成中）
                    </div>
                    {object.score ? <div className="text-xs font-semibold">评分：{object.score}/5</div> : null}
                  </div>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap prose-p:my-2 dark:prose-invert">
                    <ReactMarkdown>{object.feedback || ""}</ReactMarkdown>
                  </div>
                </div>
                
                {object.nextQuestion ? (
                  <div className="self-start rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10 w-full overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                    <div className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      面试官（下一个问题）
                    </div>
                    <div className="whitespace-pre-wrap">{object.nextQuestion}</div>
                  </div>
                ) : null}
              </div>
            ) : isBusy && !object && sessionId ? (
              <div className="self-start rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10">
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent dark:border-zinc-700 dark:border-t-transparent" />
                  <span>AI 正在思考…</span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 border-t border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-black/60">
        <div className="mx-auto w-full max-w-3xl px-4 py-4">
          <div className="flex gap-3">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={sessionId ? "输入你的回答（Enter 发送，Shift+Enter 换行）" : "请先配置并开始面试..."}
              disabled={isBusy || !sessionId}
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
          <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Session: {sessionId ?? "-"}</span>
            {isLoading && (
              <button onClick={() => stop()} className="underline hover:text-zinc-900 dark:hover:text-white">
                停止生成
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
