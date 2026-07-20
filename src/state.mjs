/**
 * state.mjs — .gotgan/ 로컬 상태 관리
 *
 * 갈피의 통제학습 원칙 이식:
 *  - runtime-learning.json: 도구별 익명 success/failure 카운터만 기록.
 *    질의 텍스트·데이터 내용·serviceKey는 절대 저장하지 않는다.
 *  - observations.jsonl: 재사용 가능한 기술 관측(스키마/포털HTML/클라이언트 변화)만.
 *    모든 관측은 candidate로 시작하며, 재현 가능한 검증 전에는 정본 지침이 되지 않는다.
 */

import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const STATE_DIR = process.env.GOTGAN_STATE_DIR || join(ROOT, ".gotgan");
const LEARN_PATH = join(STATE_DIR, "runtime-learning.json");
const OBS_PATH = join(STATE_DIR, "observations.jsonl");

function ensureDir() { mkdirSync(STATE_DIR, { recursive: true }); }

export function loadLearning() {
  if (!existsSync(LEARN_PATH)) return { version: 1, tools: {} };
  try { return JSON.parse(readFileSync(LEARN_PATH, "utf8")); }
  catch { return { version: 1, tools: {} }; }
}

/** 실패로 집계하는 status — 도구 자체가 제 역할을 못한 경우만.
 *  no_match/low_confidence/parse_partial은 정직한 성공이다. */
const FAILURE_STATUSES = new Set(["fetch_error", "parse_failed", "index_missing", "invalid_input"]);

export function recordToolResult(toolName, status) {
  ensureDir();
  const l = loadLearning();
  const t = l.tools[toolName] || { success: 0, failure: 0 };
  if (FAILURE_STATUSES.has(status)) t.failure++; else t.success++;
  t.lastUsedAt = new Date().toISOString();
  t.lastStatus = status;
  l.tools[toolName] = t;
  writeFileSync(LEARN_PATH, JSON.stringify(l, null, 2));
}

const OBS_KINDS = new Set(["schema", "portal-html", "client", "api"]);

export function recordObservation({ kind, target, summary, evidence }) {
  if (!OBS_KINDS.has(kind)) throw new Error(`kind는 ${[...OBS_KINDS].join("/")} 중 하나`);
  if (!summary || !evidence) throw new Error("summary와 evidence(재현 가능한 비민감 근거)는 필수");
  ensureDir();
  const obs = {
    id: `${Date.now()}-${randomBytes(3).toString("hex")}`,
    observedAt: new Date().toISOString(),
    kind, target: target || null, summary, evidence,
    status: "candidate"
  };
  appendFileSync(OBS_PATH, JSON.stringify(obs) + "\n");
  return obs;
}

export function loadObservations() {
  if (!existsSync(OBS_PATH)) return [];
  return readFileSync(OBS_PATH, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
}
