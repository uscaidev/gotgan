/**
 * index-store.mjs — 로컬 개방목록 인덱스 로드 + BM25 검색
 *
 * 설계 원칙:
 *  1. 무언 폴백 금지 — 매칭 실패 시 items[0]을 돌려주지 않는다.
 *     status: "ok" | "no_match" | "low_confidence" | "index_missing" 를 항상 명시.
 *  2. 부존재와 실패의 구분 — 인덱스가 없어서 못 찾은 것(index_missing)과
 *     인덱스에 진짜 없는 것(no_match)을 절대 섞지 않는다.
 *  3. 시점 정직성 — 모든 응답에 인덱스 빌드 기준일(as_of)을 붙인다.
 *     목록개방현황은 월 단위 스냅샷이므로 "현재 개방 여부"가 아니라
 *     "N월 기준 개방 목록"임을 소비자(LLM)가 알게 한다.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "../scripts/build-index.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IDX_DIR = process.env.GOTGAN_INDEX_DIR || join(ROOT, "data", "index");

let _store = null;

export function loadIndex() {
  if (_store) return _store;
  const metaPath = join(IDX_DIR, "meta.json");
  if (!existsSync(metaPath)) {
    _store = { ready: false };
    return _store;
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const inverted = JSON.parse(readFileSync(join(IDX_DIR, "inverted.json"), "utf8"));
  const records = readFileSync(join(IDX_DIR, "records.jsonl"), "utf8")
    .split("\n").filter(Boolean).map(l => JSON.parse(l));
  _store = { ready: true, meta, inverted, records };
  return _store;
}

const K1 = 1.2, B = 0.75;
// low_confidence 컷: 최고점이 이 값 미만이면 "찾긴 했으나 신뢰 낮음"으로 표시
const LOW_CONF_SCORE = 3.0;

export function search({ query, listType, org, limit = 10 }) {
  const st = loadIndex();
  if (!st.ready) {
    return { status: "index_missing",
      message: "로컬 인덱스가 없습니다. 목록개방현황 CSV를 받아 `npm run build-index <csv>`를 먼저 실행하세요.",
      hint: "data.go.kr에서 '공공데이터포털 목록개방현황' 검색" };
  }
  const toks = [...new Set(tokenize(query))];
  if (!toks.length) return { status: "no_match", as_of: st.meta.source_file, message: "질의에서 색인 가능한 토큰이 없습니다." };

  const N = st.meta.record_count, avgdl = st.meta.avg_doc_len;
  const scores = new Map();
  for (const t of toks) {
    const e = st.inverted[t];
    if (!e) continue;
    const idf = Math.log(1 + (N - e.df + 0.5) / (e.df + 0.5));
    for (const [docId, tf] of Object.entries(e.p)) {
      const dl = st.records[docId]._dl ?? avgdl;
      const s = idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / avgdl));
      scores.set(docId, (scores.get(docId) || 0) + s);
    }
  }

  let hits = [...scores.entries()]
    .map(([id, score]) => ({ score, rec: st.records[id] }))
    .sort((a, b) => b.score - a.score);

  // 사후 필터 (점수 계산에 섞지 않고 하드 필터로 — 필터 결과 0건도 정직하게 no_match)
  if (listType) hits = hits.filter(h => (h.rec.list_type || "").includes(listType));
  if (org) hits = hits.filter(h => (h.rec.org || "").includes(org));

  if (!hits.length) {
    return { status: "no_match", as_of: st.meta.source_file,
      message: "인덱스(월간 스냅샷) 기준으로 일치하는 개방목록이 없습니다. 스냅샷 이후 신규 개방됐을 가능성은 배제할 수 없습니다.",
      searched_tokens: toks.slice(0, 20) };
  }

  const top = hits.slice(0, limit).map(h => ({
    score: Number(h.score.toFixed(2)),
    목록유형: h.rec.list_type, 목록명: h.rec.title, 제공기관: h.rec.org,
    분류체계: h.rec.category, 업데이트주기: h.rec.update_cycle,
    API유형: h.rec.api_type || null, 신청가능트래픽: h.rec.traffic || null,
    심의유형: h.rec.review_type || null, 목록URL: h.rec.url || null,
    _id: h.rec.id
  }));

  return {
    status: top[0].score < LOW_CONF_SCORE ? "low_confidence" : "ok",
    as_of: st.meta.source_file,
    total_matched: hits.length,
    results: top
  };
}

export function getRecord(id) {
  const st = loadIndex();
  if (!st.ready) return { status: "index_missing" };
  const rec = st.records[id];
  if (!rec) return { status: "no_match", message: `id=${id} 레코드가 인덱스에 없습니다.` };
  return { status: "ok", as_of: st.meta.source_file, record: rec };
}
