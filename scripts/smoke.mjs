#!/usr/bin/env node
/** SDK 설치 전에도 검색 레인이 도는지 확인하는 스모크 테스트. */
import { search } from "../src/index-store.mjs";

const cases = [
  { name: "기본 검색", q: { query: "대기오염 측정" } },
  { name: "기관 필터", q: { query: "인구", org: "국토교통부" } },
  { name: "환각 트랩(부존재)", q: { query: "화성 이주민 주택청약 현황" } },
  { name: "빈 질의", q: { query: "   " } }
];

for (const c of cases) {
  const r = search(c.q);
  console.log(`\n=== ${c.name} → status: ${r.status}`);
  if (r.results) for (const h of r.results.slice(0, 3))
    console.log(`  [${h.score}] ${h.목록유형} | ${h.목록명} (${h.제공기관})`);
  else console.log(" ", r.message || "");
}
