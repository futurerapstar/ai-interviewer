import { NextResponse } from "next/server";

import { llmChat } from "@/lib/ai";
import { redis } from "@/lib/redis";
import {
  buildSystemPrompt,
  START_QUESTION_USER_PROMPT,
} from "@/lib/prompts";
import type { Message, StartResponse, StartRequest } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 60 * 60 * 6;

export async function POST(req: Request) {
  try {
    const json = (await req.json().catch(() => ({}))) as StartRequest;
    const { resumeText, jdText } = json;

    const sessionId = crypto.randomUUID();

    const systemPrompt = buildSystemPrompt(resumeText, jdText);

    const question = (await llmChat({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        { role: "user", content: START_QUESTION_USER_PROMPT },
      ],
      temperature: 0.7,
      maxTokens: 200,
    })).trim();

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      { role: "assistant", content: question },
    ];

    await redis.set(`session:${sessionId}`, messages, { ex: SESSION_TTL_SECONDS });

    const body: StartResponse = { sessionId, question };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `初始化面试失败：${message}` },
      { status: 500 },
    );
  }
}

