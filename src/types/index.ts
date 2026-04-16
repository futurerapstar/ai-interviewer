export type Role = "system" | "user" | "assistant";

export type Message = {
  role: Role;
  content: string;
};

export type StartResponse = {
  sessionId: string;
  question: string;
};

export type AnswerRequest = {
  sessionId: string;
  answer: string;
};

export type AnswerResponse = {
  score: 1 | 2 | 3 | 4 | 5;
  feedback: string;
  nextQuestion: string;
};

export type ApiErrorResponse = {
  error: string;
};
