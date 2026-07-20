/**
 * spec-fetch.mjs — data.go.kr 상세페이지에서 API 사용방법을 구조화 추출
 *
 * v0.1 범위:
 *  - openapi.do / fileData.do 페이지의 구조화 필드 추출
 *    (요청주소, 서비스URL, 활용승인 절차, 신청가능 트래픽, API 유형, 데이터포맷)
 *  - 첨부 기술문서(hwp/hwpx/docx/pdf) 링크 수집 — 파싱은 v0.2 과제
 *  - Swagger/OpenAPI JSON이 노출된 경우 병합
 *
 * 정직성 규칙:
 *  - HTML 구조 변경으로 필드 일부만 추출되면 status: "parse_partial" + missing_fields 명시
 *  - 네트워크 실패는 fetch_error — "해당 API가 없다"로 번역하지 않는다
 *  - 폐쇄망에서는 이 도구 전체가 unavailable — 서버가 기동 시 감지해 도구 설명에 반영
 */

const FIELD_PATTERNS = {
  요청주소:      /요청주소\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/,
  서비스URL:     /서비스URL\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/,
  활용승인절차:  /활용승인\s*절차\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/,
  신청가능트래픽: /신청가능\s*트래픽\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/,
  API유형:       /API\s*유형\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/,
  데이터포맷:    /데이터포맷\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/,
  비용부과유무:  /비용부과유무\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/,
  이용허락범위:  /이용허락범위\s*<\/[^>]+>\s*<[^>]+>\s*([^<]+)/
};

const ATTACH_RE = /href="([^"]*(?:fileDownload|atchFile|FileDown)[^"]*)"[^>]*>([^<]*\.(?:hwpx?|docx?|pdf|xlsx?))/gi;

export async function fetchApiSpec(url) {
  if (!/^https:\/\/www\.data\.go\.kr\//.test(url)) {
    return { status: "invalid_input", message: "data.go.kr 상세페이지 URL만 지원합니다.", got: url };
  }
  let html;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "gotgan-mcp/0.1 (public-data spec reader)" },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return { status: "fetch_error", http_status: res.status, url };
    html = await res.text();
  } catch (e) {
    return { status: "fetch_error", url,
      message: `상세페이지 조회 실패(${e.name}). API 부존재가 아니라 네트워크/차단 문제일 수 있습니다.` };
  }

  const fields = {}, missing = [];
  for (const [name, re] of Object.entries(FIELD_PATTERNS)) {
    const m = html.match(re);
    if (m) fields[name] = m[1].trim(); else missing.push(name);
  }

  const attachments = [];
  for (const m of html.matchAll(ATTACH_RE)) {
    attachments.push({
      filename: m[2].trim(),
      href: new URL(m[1], "https://www.data.go.kr").toString(),
      note: "기술문서 본문 파싱은 v0.2 — 현재는 링크만 제공"
    });
  }

  // 페이지 내 swagger json 흔적
  const swagger = html.match(/["'](\/tcs\/dss\/[^"']*swagger[^"']*|[^"']*openapi\.json)["']/i);

  const extractedCount = Object.keys(fields).length;
  const status = extractedCount === 0 ? "parse_failed"
               : missing.length ? "parse_partial" : "ok";

  return {
    status, url,
    fields,
    missing_fields: missing.length ? missing : undefined,
    attachments: attachments.length ? attachments : undefined,
    swagger_hint: swagger ? new URL(swagger[1], "https://www.data.go.kr").toString() : undefined,
    caveat: "요청주소 실호출에는 활용신청 후 발급받은 serviceKey가 필요합니다."
  };
}

/** 스펙 → 활용신청 체크리스트 + 샘플 curl (플레이스홀더 키) */
export function buildUsageGuide(spec) {
  if (spec.status === "fetch_error" || spec.status === "parse_failed") {
    return { status: spec.status, message: "스펙 추출이 안 된 상태라 사용가이드를 만들 수 없습니다." };
  }
  const endpoint = spec.fields?.["요청주소"] || spec.fields?.["서비스URL"];
  const checklist = [
    "1. data.go.kr 로그인 → 해당 목록 페이지에서 [활용신청] (개발계정: " + (spec.fields?.["신청가능트래픽"] || "트래픽 정보 미확인") + ")",
    "2. 승인유형 확인: " + (spec.fields?.["활용승인절차"] || "미확인 — 자동승인이 아니면 심의 소요일 감안"),
    "3. 마이페이지에서 serviceKey(일반 인증키) 확인 — Encoding/Decoding 키 구분 주의",
    "4. 첨부 기술문서로 파라미터·응답스키마 확정" + (spec.attachments ? ` (${spec.attachments.map(a => a.filename).join(", ")})` : " (첨부 미확인)")
  ];
  return {
    status: endpoint ? "ok" : "partial",
    checklist,
    sample_curl: endpoint
      ? `curl -G '${endpoint}' --data-urlencode 'serviceKey=<발급받은_인증키>' --data-urlencode 'pageNo=1' --data-urlencode 'numOfRows=10' --data-urlencode '_type=json'`
      : undefined,
    warning: endpoint ? undefined : "요청주소를 추출하지 못해 샘플 호출을 생성하지 않았습니다. 임의 URL 추정은 하지 않습니다."
  };
}
