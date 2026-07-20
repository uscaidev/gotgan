#!/usr/bin/env node
/**
 * build-index.mjs
 * 공공데이터활용지원센터_공공데이터포털 목록개방현황 CSV를 로컬 검색 인덱스로 변환한다.
 *
 * 입력: data.go.kr에서 내려받은 목록개방현황 CSV (예: 목록개방현황_20260131.csv)
 *   - '25.7월분부터 파일데이터·오픈API 상세페이지의 전체 칼럼이 포함됨
 *   - 인코딩은 UTF-8(BOM) 또는 CP949 혼재 → 자동 감지
 * 출력: data/index/
 *   - records.jsonl   레코드 원본(행 단위 JSON)
 *   - inverted.json   바이그램 역색인 (BM25용 df/tf)
 *   - meta.json       빌드 시각, 원본 파일명, 레코드 수, 칼럼 매핑 결과
 *
 * 사용: node scripts/build-index.mjs <csv경로>
 *
 * 외부 의존성 없음 — 폐쇄망 반입 시 스크립트 파일만 옮기면 된다.
 */

import { readFileSync, mkdirSync, writeFileSync, createWriteStream } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "data", "index");

// ---------- 1. 인코딩 감지 + 디코드 ----------
function decodeAuto(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString("utf8"), encoding: "utf-8-bom" };
  }
  const asUtf8 = buf.toString("utf8");
  // 대체문자(U+FFFD) 비율로 UTF-8 여부 판정
  const bad = (asUtf8.match(/\uFFFD/g) || []).length;
  if (bad / Math.max(asUtf8.length, 1) < 0.001) {
    return { text: asUtf8, encoding: "utf-8" };
  }
  const dec = new TextDecoder("euc-kr"); // Node full-ICU: CP949 계열 커버
  return { text: dec.decode(buf), encoding: "euc-kr(cp949)" };
}

// ---------- 2. RFC4180 CSV 파서 (따옴표/줄바꿈 내포 대응) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- 3. 칼럼 매핑 ----------
// 헤더명이 개편될 수 있으므로 부분일치 후보를 순서대로 시도하고,
// 실패한 매핑은 meta.json에 기록해 무언 실패를 막는다.
const COLUMN_CANDIDATES = {
  list_type:   ["목록유형"],
  title:       ["목록명"],
  file_title:  ["파일데이터명", "오픈API명", "API명"],
  category:    ["분류체계"],
  org:         ["제공기관"],
  dept:        ["관리부서명", "부서명"],
  tel:         ["관리부서 전화번호", "전화번호"],
  legal_basis: ["보유근거"],
  update_cycle:["업데이트 주기"],
  next_update: ["차기 등록 예정일"],
  media_type:  ["매체유형"],
  data_limit:  ["데이터 한계"],
  provide_form:["제공형태"],
  description: ["설명"],
  note:        ["기타 유의사항"],
  api_type:    ["API 유형"],
  traffic:     ["신청가능 트래픽"],
  review_type: ["심의 유형", "심의유형"],
  views:       ["조회수"],
  url:         ["목록 URL", "목록URL", "URL"],
  national_core:["국가중점"],
  keywords:    ["키워드"],
  fee:         ["비용부과유무", "이용허락범위"]
};

function mapColumns(header) {
  const idx = {}, misses = [];
  for (const [key, cands] of Object.entries(COLUMN_CANDIDATES)) {
    let found = -1;
    for (const cand of cands) {
      found = header.findIndex(h => h.replace(/\s/g, "").includes(cand.replace(/\s/g, "")));
      if (found >= 0) break;
    }
    if (found >= 0) idx[key] = found; else misses.push(key);
  }
  return { idx, misses };
}

// ---------- 4. 토크나이저 (한글 바이그램 + ASCII 단어) ----------
export function tokenize(s) {
  const out = [];
  const norm = String(s || "").toLowerCase().normalize("NFKC");
  for (const m of norm.matchAll(/[a-z0-9_]+|[가-힣]+/g)) {
    const t = m[0];
    if (/^[a-z0-9_]/.test(t)) { out.push(t); continue; }
    if (t.length === 1) { out.push(t); continue; }
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  }
  return out;
}

// ---------- main ----------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
const csvPath = process.argv[2];
if (!csvPath) {
  console.error("사용법: node scripts/build-index.mjs <목록개방현황.csv>");
  process.exit(1);
}

const buf = readFileSync(csvPath);
const { text, encoding } = decodeAuto(buf);
const rows = parseCsv(text);
const header = rows[0].map(h => h.trim());
const { idx, misses } = mapColumns(header);

if (!("title" in idx) || !("org" in idx)) {
  console.error("필수 칼럼(목록명/제공기관) 매핑 실패 — 헤더 확인 필요:", header.slice(0, 10));
  process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });
const recStream = createWriteStream(join(OUT_DIR, "records.jsonl"));

// 역색인: token -> { df, postings: { docId: tf } }
const inverted = new Map();
let docCount = 0;
const docLens = [];

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (row.length < 3) continue;
  const rec = { id: docCount };
  for (const [key, col] of Object.entries(idx)) rec[key] = (row[col] || "").trim();

  const searchable = [rec.title, rec.file_title, rec.description, rec.category,
                      rec.org, rec.dept, rec.keywords].filter(Boolean).join(" ");
  const toks = tokenize(searchable);
  docLens.push(toks.length);
  rec._dl = toks.length;
  recStream.write(JSON.stringify(rec) + "\n");
  const tf = new Map();
  for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
  for (const [t, n] of tf) {
    let e = inverted.get(t);
    if (!e) { e = { df: 0, p: {} }; inverted.set(t, e); }
    e.df++; e.p[docCount] = n;
  }
  docCount++;
}
recStream.end();

// 극저빈도가 아닌 초고빈도 토큰만 남기는 게 아니라 전부 저장 (파일 크기 감수, 정확도 우선)
const invObj = {};
for (const [t, e] of inverted) invObj[t] = e;

writeFileSync(join(OUT_DIR, "inverted.json"), JSON.stringify(invObj));
writeFileSync(join(OUT_DIR, "meta.json"), JSON.stringify({
  built_at: new Date().toISOString(),
  source_file: basename(csvPath),
  source_encoding: encoding,
  record_count: docCount,
  avg_doc_len: docLens.reduce((a, b) => a + b, 0) / Math.max(docCount, 1),
  column_map: idx,
  unmapped_columns: misses,   // ← 여기 값이 있으면 헤더 개편 발생: 무언 진행 금지, 확인할 것
  header
}, null, 2));

console.log(`인덱스 빌드 완료: ${docCount}건 (인코딩 ${encoding})`);
if (misses.length) console.warn("⚠ 매핑 실패 칼럼:", misses.join(", "), "— meta.json 확인");
}
