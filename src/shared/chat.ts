import { CAMPFIRE } from "./campfire.ts";
// Public text chat exists only around the campfire. Membership uses a fixed
// circle with a wider exit radius, so pacing along the edge doesn't flicker
// a visitor in and out of the conversation.
export const CAMPFIRE_CHAT = { x: CAMPFIRE.x, y: CAMPFIRE.y, enter: 170, leave: 210 };
export const CHAT_MAX_LENGTH = 200;
export const CHAT_RATE = { messages: 5, windowMs: 10_000, minGapMs: 600 };
export const REPORT_REASONS = {
  spam: "Spam or flooding",
  unkind: "Unkind or harassing",
  unsafe: "Unsafe or inappropriate",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export interface ChatMessage { id: number; playerId: string; name: string; text: string; at: number; clientId?: string }
export interface ChatBlock { id: number; name: string }
export type ChatIntent =
  | { type: "chat-send"; text: string; clientId: string }
  | { type: "chat-block"; messageId: number }
  | { type: "chat-unblock"; blockId: number }
  | { type: "chat-report"; messageId: number; reason: ReportReason };
export type ChatServerMessage =
  | { type: "chat-status"; member: boolean; nearby: number }
  | { type: "chat-message"; message: ChatMessage }
  | { type: "chat-rejected"; reason: string; clientId?: string }
  | { type: "chat-blocks"; blocks: ChatBlock[] }
  | { type: "chat-reported" };
export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && Object.hasOwn(REPORT_REASONS, value);
}
// Control characters and line breaks become spaces; the result is one line.
export function cleanChatText(value: unknown): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
}
