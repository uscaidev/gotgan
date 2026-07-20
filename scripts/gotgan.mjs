#!/usr/bin/env node
/**
 * gotgan.mjs — 운영 CLI
 *
 *   node scripts/gotgan.mjs setup [--live] [--json]
 *   node scripts/gotgan.mjs guide
 *   node scripts/gotgan.mjs doctor [--live] [--json]
 *   node scripts/gotgan.mjs monitor-source [--url <data.go.kr URL>] [--no-save] [--json]
 *   node scripts/gotgan.mjs learn --kind schema|portal-html|client|api --target <t> --summary "..." --evidence "..."
 *   node scripts/gotgan.mjs evolve            # 라이브 재검증 후 설치된 스킬 갱신
 *
 * doctor 실패 분류 원칙: 인덱스 미구축 / 스냅샷 노후 / 헤더 개편 / 포털 HTML 변경 /
 * 네트워크 차단 / 정상 빈 결과를 절대 하나로 뭉개지 않는다.
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadIndex } from "../src/index-store.mjs";
import { fetchApiSpec } from "../src/spec-fetch.mjs";
import { recordObservation, loadObservations, loadLearning, STATE_DIR } from "../src/state.mjs";
import { DEFAULT_CATALOG_URL, monitorSource } from "../src/source-monitor.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_SRC = join(ROOT, "skills", "gotgan-data");
const GUIDE_PATH = join(ROOT, "onboarding", "README.md");

/** 포털 HTML 변경 감지용 카나리 — 장수 데이터셋의 상세페이지.
 *  기대치: FIELD_PATTERNS 추출률. 추출률이 급락하면 포털 개편 신호. */
const CANARIES = [
  { name: "에어코리아 대기오염정보 (오픈API)", url: "https://www.data.go.kr/data/15073861/openapi.do", min_fields: 4 },
  { name: "목록개방현황 (파일데이터)", url: "https://www.data.go.kr/data/15062804/fileData.do", min_fields: 1 }
];

const STALE_DAYS = 40; // 월간 스냅샷 + 여유 10일

function snapshotAge(meta) {
  const m = (meta.source_file || "").match(/(\d{4})(\d{2})(\d{2})/);
  const base = m ? new Date(`${m[1]}-${m[2]}-${m[3]}`) : new Date(meta.built_at);
  return Math.floor((Date.now() - base.getTime()) / 86400000);
}

async function doctor({ live, json, silent = false }) {
  const checks = [];
  const idx = loadIndex();

  if (!idx.ready) {
    checks.push({ check: "index", ok: false, kind: "index_missing",
      fix: "목록개방현황 CSV 다운로드 후 npm run build-index -- <csv>" });
  } else {
    const age = snapshotAge(idx.meta);
    checks.push({ check: "index", ok: true, records: idx.meta.record_count, as_of: idx.meta.source_file });
    checks.push({ check: "snapshot_freshness", ok: age <= STALE_DAYS, age_days: age,
      ...(age > STALE_DAYS && { kind: "stale_snapshot", fix: "최신 월분 CSV로 재빌드" }) });
    const misses = idx.meta.unmapped_columns || [];
    checks.push({ check: "column_map", ok: misses.length === 0,
      ...(misses.length && { kind: "schema_drift", unmapped: misses,
        fix: "COLUMN_CANDIDATES 갱신 후 learn --kind schema로 관측 기록" }) });
  }

  if (live) {
    for (const c of CANARIES) {
      const spec = await fetchApiSpec(c.url);
      if (spec.status === "fetch_error") {
        checks.push({ check: `canary:${c.name}`, ok: false, kind: "network_or_block",
          note: "포털 변경이 아니라 네트워크/차단 문제일 수 있음 — HTML 변경으로 단정 금지" });
      } else {
        const n = Object.keys(spec.fields || {}).length;
        checks.push({ check: `canary:${c.name}`, ok: n >= c.min_fields,
          extracted_fields: n, required: c.min_fields,
          ...(n < c.min_fields && { kind: "portal_html_drift",
            fix: "FIELD_PATTERNS 점검 후 learn --kind portal-html로 관측 기록" }) });
      }
    }
  } else {
    checks.push({ check: "canary", ok: null, note: "--live 미지정: 온라인 레인 미검증" });
  }

  const learning = loadLearning();
  for (const [tool, t] of Object.entries(learning.tools || {})) {
    if (t.failure >= 3 && t.failure > t.success) {
      checks.push({ check: `runtime:${tool}`, ok: false, kind: "regression_suspect",
        success: t.success, failure: t.failure, fix: "observations 확인 및 재현 테스트" });
    }
  }

  const result = { ranAt: new Date().toISOString(), live: !!live, checks,
    ok: checks.every(c => c.ok !== false) };
  if (!silent) {
    if (json) console.log(JSON.stringify(result, null, 2));
    else for (const c of checks)
      console.log(`${c.ok === false ? "✗" : c.ok === null ? "△" : "✓"} ${c.check}` +
        (c.kind ? ` [${c.kind}]` : "") + (c.fix ? ` → ${c.fix}` : ""));
  }
  return result;
}

async function setup({ live, json }) {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({
    check: "node",
    ok: nodeMajor >= 20,
    version: process.versions.node,
    ...(nodeMajor < 20 && { kind: "node_too_old", fix: "Node.js 20 이상 설치" })
  });
  checks.push({
    check: "package",
    ok: existsSync(join(ROOT, "package.json")),
    ...(existsSync(join(ROOT, "package.json")) ? {} : { kind: "package_missing" })
  });
  checks.push({
    check: "dependencies",
    ok: existsSync(join(ROOT, "node_modules", "@modelcontextprotocol", "sdk")),
    ...(existsSync(join(ROOT, "node_modules", "@modelcontextprotocol", "sdk")) ? {} : {
      kind: "dependencies_missing",
      fix: "npm install"
    })
  });
  checks.push({
    check: "skill_source",
    ok: existsSync(join(SKILL_SRC, "SKILL.md")),
    ...(existsSync(join(SKILL_SRC, "SKILL.md")) ? {} : { kind: "skill_missing" })
  });
  checks.push({
    check: "examples",
    ok: existsSync(join(ROOT, "examples", "mcp", "claude-desktop.json")),
    ...(existsSync(join(ROOT, "examples", "mcp", "claude-desktop.json")) ? {} : { kind: "examples_missing" })
  });

  const d = await doctor({ live: !!live, json: true, silent: true });
  checks.push(...d.checks.map((c) => ({ ...c, check: `doctor:${c.check}` })));
  const result = {
    ranAt: new Date().toISOString(),
    live: !!live,
    checks,
    ok: checks.every((c) => c.ok !== false),
    next: checks.some((c) => c.kind === "index_missing")
      ? "data.go.kr에서 최신 목록개방현황 CSV를 내려받아 `npm run build-index -- <csv>`를 실행하세요."
      : "Codex/Claude MCP 클라이언트에 `node scripts/run-stdio.mjs`를 등록하세요."
  };

  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const c of checks) {
      console.log(`${c.ok === false ? "✗" : c.ok === null ? "△" : "✓"} ${c.check}` +
        (c.kind ? ` [${c.kind}]` : "") + (c.fix ? ` → ${c.fix}` : ""));
    }
    console.log(`다음 단계: ${result.next}`);
  }
  return result;
}

function guide() {
  console.log(`곳간 온보딩 가이드: ${GUIDE_PATH}`);
  if (existsSync(GUIDE_PATH)) {
    console.log(readFileSync(GUIDE_PATH, "utf8"));
  } else {
    console.log("onboarding/README.md 파일이 없습니다. README.md의 '처음 시작' 절을 확인하세요.");
  }
}

function findSkillTargets(homeOverride) {
  const home = homeOverride || homedir();
  return [join(home, ".claude", "skills", "gotgan-data"),
          join(home, ".agents", "skills", "gotgan-data")];
}

function refreshSkills(homeOverride) {
  const refreshed = [];
  for (const dst of findSkillTargets(homeOverride)) {
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(SKILL_SRC, dst, { recursive: true });
    writeFileSync(join(dst, ".gotgan-managed"), `managed by ${ROOT}\n`);
    refreshed.push(dst);
  }
  return refreshed;
}

async function evolve() {
  console.error("evolve: 라이브 재검증 중...");
  const d = await doctor({ live: true, json: false });
  const liveOk = d.checks.filter(c => c.check.startsWith("canary:")).every(c => c.ok);
  if (!liveOk) {
    console.error("✗ 라이브 검증 실패 — 스킬을 갱신하지 않습니다. 검증 없는 지침 승격 금지.");
    process.exit(1);
  }
  const idx = loadIndex();
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, "evolution.json"), JSON.stringify({
    verifiedAt: new Date().toISOString(),
    index: idx.ready ? { as_of: idx.meta.source_file, records: idx.meta.record_count } : null,
    canaries: d.checks.filter(c => c.check.startsWith("canary:")),
    candidate_observations: loadObservations().filter(o => o.status === "candidate").length
  }, null, 2));
  const refreshed = refreshSkills(process.env.GOTGAN_HOME);
  console.error("✓ evolve 완료. 스킬 갱신:", refreshed.join(", "));
}

async function monitorSourceCli({ url, save, json }) {
  const result = await monitorSource({ url: url || DEFAULT_CATALOG_URL, save });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  const mark = result.status === "changed" ? "!" :
               result.status === "fetch_error" ? "✗" :
               result.status === "first_seen" ? "+" : "✓";
  console.log(`${mark} source:${result.status} — ${result.url}`);
  if (result.observed) {
    console.log(`  snapshot=${result.observed.snapshot_ymd || "unknown"} modified=${result.observed.modified_date || "unknown"} next=${result.observed.next_update_date || "unknown"} rows=${result.observed.row_count_hint || "unknown"}`);
  }
  for (const c of result.changes || []) {
    console.log(`  changed ${c.field}: ${c.before ?? "null"} -> ${c.after ?? "null"}`);
  }
  if (result.missing_fields?.length) console.log(`  missing: ${result.missing_fields.join(", ")}`);
  if (result.recommendation) console.log(`  → ${result.recommendation}`);
  return result;
}

// ---------- CLI ----------
const [cmd, ...rest] = process.argv.slice(2);
const flags = {}; for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith("--") || rest[i + 1] === undefined ? true : rest[++i];
}

if (cmd === "setup") await setup({ live: !!flags.live, json: !!flags.json });
else if (cmd === "guide") guide();
else if (cmd === "doctor") await doctor({ live: !!flags.live, json: !!flags.json });
else if (cmd === "monitor-source") await monitorSourceCli({
  url: flags.url,
  save: !flags["no-save"],
  json: !!flags.json
});
else if (cmd === "learn") {
  const obs = recordObservation({ kind: flags.kind, target: flags.target, summary: flags.summary, evidence: flags.evidence });
  console.log("candidate 관측 기록:", obs.id, "— evolve 검증 전에는 정본이 아닙니다.");
} else if (cmd === "evolve") await evolve();
else {
  console.error("사용법: gotgan.mjs setup [--live] [--json] | guide | doctor [--live] [--json] | monitor-source [--url <u>] [--no-save] [--json] | learn --kind <k> --summary <s> --evidence <e> | evolve");
  process.exit(1);
}
