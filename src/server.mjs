#!/usr/bin/env node
/**
 * gotgan-mcp — 공공데이터포털 개방목록 검색 · API 사용방법 조회 MCP
 *
 * 도구 구성 (오프라인/온라인 레인 분리):
 *  [오프라인 — 폐쇄망 가용]
 *   - search_dataset   : 목록개방현황 로컬 인덱스 BM25 검색
 *   - get_dataset_detail: 인덱스 레코드 전체 필드 조회
 *  [온라인 — 인터넷망 전용]
 *   - get_api_spec     : 상세페이지 라이브 조회 → 구조화 스펙
 *   - build_usage_guide: 스펙 → 활용신청 체크리스트 + 샘플 curl
 *
 * 폐쇄과업 원칙: 각 도구는 자기 상태(status)를 반드시 명시하고,
 * 실패를 다른 결론("데이터 없음")으로 승격하지 않는다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { search, getRecord, loadIndex } from "./index-store.mjs";
import { fetchApiSpec, buildUsageGuide } from "./spec-fetch.mjs";
import { recordToolResult } from "./state.mjs";

const idx = loadIndex();
const asOf = idx.ready ? idx.meta.source_file : "인덱스 미구축";

const server = new McpServer({ name: "gotgan-mcp", version: "0.1.0" });

const json = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });
// 익명 카운터: status만 집계. 질의·결과 내용은 기록하지 않는다.
const respond = (tool, o) => { try { recordToolResult(tool, o?.status); } catch {} return json(o); };

server.tool(
  "search_dataset",
  `공공데이터포털 개방목록(월간 스냅샷: ${asOf})에서 데이터셋/오픈API를 검색한다. ` +
  `결과의 status를 반드시 확인할 것: no_match는 "스냅샷 기준 부존재"이지 "영구 부존재"가 아니며, ` +
  `low_confidence면 결과를 단정하지 말 것.`,
  {
    query: z.string().describe("검색어 (업무 키워드, 기관명, 데이터셋명 등)"),
    list_type: z.enum(["API", "파일", "표준"]).optional().describe("목록유형 필터"),
    org: z.string().optional().describe("제공기관 필터 (부분일치)"),
    limit: z.number().int().min(1).max(30).optional()
  },
  async ({ query, list_type, org, limit }) =>
    respond("search_dataset", search({ query, listType: list_type, org, limit: limit ?? 10 }))
);

server.tool(
  "get_dataset_detail",
  "search_dataset 결과의 _id로 해당 개방목록의 전체 필드(보유근거, 데이터 한계, 차기 등록 예정일, 기타 유의사항 등)를 조회한다. 오프라인 인덱스 기반.",
  { id: z.number().int().describe("search_dataset 결과의 _id") },
  async ({ id }) => respond("get_dataset_detail", getRecord(id))
);

server.tool(
  "get_api_spec",
  "data.go.kr 상세페이지 URL을 라이브 조회해 요청주소·트래픽·승인절차·첨부 기술문서 링크를 구조화 추출한다. " +
  "인터넷망 전용 — fetch_error는 네트워크 문제이지 API 부존재가 아니다. parse_partial이면 missing_fields를 사용자에게 알릴 것.",
  { url: z.string().url().describe("https://www.data.go.kr/data/.../openapi.do 형식") },
  async ({ url }) => respond("get_api_spec", await fetchApiSpec(url))
);

server.tool(
  "build_usage_guide",
  "get_api_spec 결과를 받아 활용신청 체크리스트와 샘플 curl(플레이스홀더 serviceKey)을 생성한다. 실호출은 하지 않는다 — 인증키 발급은 사람의 절차.",
  { spec_json: z.string().describe("get_api_spec이 반환한 JSON 문자열 그대로") },
  async ({ spec_json }) => {
    let spec;
    try { spec = JSON.parse(spec_json); }
    catch { return json({ status: "invalid_input", message: "spec_json이 유효한 JSON이 아닙니다." }); }
    return respond("build_usage_guide", buildUsageGuide(spec));
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[gotgan-mcp] 기동 — 인덱스: ${asOf}${idx.ready ? ` (${idx.meta.record_count}건)` : " ⚠ build-index 필요"}`);
