/**
 * source-monitor.mjs — data.go.kr 원천 목록 변화 감지
 *
 * 스케줄러는 운영환경(Windows Task Scheduler/cron/systemd)에 맡기고,
 * 이 모듈은 원천 페이지의 안정적인 관측값만 비교한다.
 * serviceKey, 사용자 질의, 다운로드 파일 본문은 저장하지 않는다.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { STATE_DIR } from "./state.mjs";

export const DEFAULT_CATALOG_URL = "https://www.data.go.kr/data/15062804/fileData.do";
const STATE_PATH = join(STATE_DIR, "source-monitor.json");

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function extractSourceFacts(html, url) {
  const text = stripHtml(html);
  const fileMatch = text.match(/목록개방현황[_\s-]*(\d{8})/);
  const nextUpdate = text.match(/차기\s*등록\s*예정일\s*(\d{4}-\d{2}-\d{2})/);
  const modified = text.match(/수정일\s*(\d{4}-\d{2}-\d{2})/);
  const registered = text.match(/등록일\s*(\d{4}-\d{2}-\d{2})/);
  const rows = text.match(/전체\s*행\s*([0-9,]+)/);
  const schemaOrg = /schema\.org/i.test(html);
  const dcat = /\bDCAT\b/i.test(html);

  const facts = {
    url,
    source_name: "공공데이터활용지원센터_공공데이터포털 목록개방현황",
    snapshot_ymd: fileMatch?.[1] || null,
    registered_date: registered?.[1] || null,
    modified_date: modified?.[1] || null,
    next_update_date: nextUpdate?.[1] || null,
    row_count_hint: rows ? Number(rows[1].replace(/,/g, "")) : null,
    metadata_links: { schema_org: schemaOrg, dcat },
  };

  return {
    ...facts,
    fingerprint: sha256(facts),
    extracted_at: new Date().toISOString(),
  };
}

function loadPrevious() {
  if (!existsSync(STATE_PATH)) return null;
  try { return JSON.parse(readFileSync(STATE_PATH, "utf8").replace(/^\uFEFF/, "")); }
  catch { return null; }
}

function saveCurrent(current) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(current, null, 2));
}

function diffFacts(previous, current) {
  if (!previous) return [];
  const keys = ["snapshot_ymd", "registered_date", "modified_date", "next_update_date", "row_count_hint"];
  return keys
    .filter((key) => previous[key] !== current[key])
    .map((key) => ({ field: key, before: previous[key] ?? null, after: current[key] ?? null }));
}

export async function monitorSource({ url = DEFAULT_CATALOG_URL, save = true } = {}) {
  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "gotgan-mcp/0.1 source monitor" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { status: "fetch_error", url, http_status: res.status };
    html = await res.text();
  } catch (e) {
    return {
      status: "fetch_error",
      url,
      message: `원천 페이지 조회 실패(${e.name}). 원천 미변경이 아니라 네트워크/차단 문제일 수 있습니다.`,
    };
  }

  const previous = loadPrevious();
  const current = extractSourceFacts(html, url);
  const missing = Object.entries(current)
    .filter(([key, value]) => key.endsWith("_date") || key === "snapshot_ymd" ? !value : false)
    .map(([key]) => key);
  const changes = diffFacts(previous, current);
  const changed = previous ? previous.fingerprint !== current.fingerprint || changes.length > 0 : null;

  if (save) saveCurrent(current);

  return {
    status: previous ? (changed ? "changed" : "unchanged") : "first_seen",
    url,
    observed: current,
    previous: previous ? {
      snapshot_ymd: previous.snapshot_ymd,
      modified_date: previous.modified_date,
      next_update_date: previous.next_update_date,
      row_count_hint: previous.row_count_hint,
      fingerprint: previous.fingerprint,
      extracted_at: previous.extracted_at,
    } : null,
    changes,
    missing_fields: missing.length ? missing : undefined,
    recommendation: !previous
      ? "최초 관측입니다. 저장 실행으로 기준 상태를 만든 뒤 다음 주기부터 변화 여부를 비교하세요."
      : changed
        ? "최신 CSV 다운로드 후 `npm run build-index -- <csv>`로 재색인하고 smoke/doctor를 실행하세요."
        : "원천 관측값 변화 없음. 기존 인덱스 유지 가능.",
  };
}
