---
name: gotgan-data
description: Set up, diagnose, and use the Gotgan public-data MCP for searching Korea's data.go.kr open-data catalog and retrieving API usage specifications. Use when a user asks to find public datasets or open APIs, needs API usage steps or a serviceKey checklist, asks about data linkage feasibility, or encounters a Gotgan index or portal fetch error.
---

# Gotgan Data

곳간은 소스 조회·판정 도구다. 데이터 존재 여부와 사용방법의 최종 확정은 data.go.kr 원문 페이지에서 하도록 사용자에게 안내한다.

## First-run decision

1. 저장소를 찾는다. GitHub URL만 받았다면 영속 폴더에 clone 후 `npm install`.
2. `npm run setup` 또는 `node scripts/gotgan.mjs setup --json`을 먼저 실행하고 설치 완료를 가정하지 않는다.
3. 인덱스가 없으면(`index_missing`) `npm run guide`로 CSV 준비 절차를 안내한다.
4. data.go.kr에서 「공공데이터포털 목록개방현황」 최신 CSV를 받은 뒤 `npm run build-index -- <csv>`.
5. `npm run smoke`와 `npm run doctor -- --live`로 오프라인/온라인 레인을 확인한다.
6. `stale_snapshot` 경고가 있으면 최신 월분으로 재빌드를 권한다.
7. 원천 변화 확인이 필요하면 `node scripts/gotgan.mjs monitor-source --json`으로 목록개방현황 상세페이지의 기준일·수정일·차기등록예정일 변화를 본다.
8. serviceKey는 곳간이 다루지 않는다 — 발급·보관은 사용자의 절차이며, 곳간에 입력하라고 요구하지 않는다.

## Retrieval workflow

1. `search_dataset`으로 검색하고 **status를 먼저 읽는다**:
   - `no_match` = "스냅샷(as_of) 기준 부존재". 영구 부존재로 번역하지 않는다.
   - `low_confidence` = 결과를 단정하지 말고 사용자에게 확신도를 알린다.
   - `index_missing` = 검색 실패가 아니라 설치 미완 — First-run으로 돌아간다.
2. 후보 확정 후 `get_dataset_detail(_id)`로 전체 필드(보유근거, 데이터 한계, 차기 등록 예정일 등)를 본다.
3. API 사용방법이 필요하면 `get_api_spec(목록URL)` → `build_usage_guide`.
   - `parse_partial`이면 missing_fields를 사용자에게 그대로 알린다.
   - **요청주소·파라미터를 절대 추정 생성하지 않는다.** 추출 실패 = 실패라고 보고한다.
4. 모든 답변에 스냅샷 기준일(as_of)을 명시하고, 최종 확인은 목록URL 원문에서 하도록 안내한다.

## Linkage assessment

연계 방식은 **갱신주기 × 망환경 × 트래픽** 3축으로 판정한다 (references/linkage.md):
- 갱신 연 1회 데이터에 실시간 API 설계 = 과잉 → 파일 배치 권고
- 폐쇄망 내부 시스템 = API 직접 호출 불가 → 망연계 중계 또는 반입 배치
- 개발계정 트래픽으로 운영 서비스 설계 = 오류로 지적
판정문에는 근거 필드(업데이트 주기, 심의 유형, 신청가능 트래픽)를 반드시 인용한다.

## Failure handling

1. `node scripts/gotgan.mjs doctor --live`.
2. 구분할 것: 인덱스 미구축 / 스냅샷 노후 / CSV 헤더 개편(schema_drift) / 포털 HTML 변경(portal_html_drift) / 네트워크 차단 / 정상 빈 결과. 이 여섯을 절대 하나로 뭉개지 않는다.
3. `fetch_error`를 "데이터 없음"으로 번역하지 않는다.
4. 다운로드 링크·첨부 URL에 세션 파라미터가 있으면 그대로 노출하지 않는다.

## Source monitoring

원천 데이터 변화 감지는 OS 스케줄러와 `monitor-source` 명령을 결합한다. `first_seen`은 최초 관측, `unchanged`는 이전 관측값과 동일, `changed`는 최신 CSV 재다운로드·재색인 필요, `fetch_error`는 네트워크/차단/포털 장애 가능성이다. `fetch_error`를 "변화 없음"으로 처리하지 않는다.

## Controlled learning

곳간은 `.gotgan/runtime-learning.json`에 도구별 익명 성공/실패 카운터만 기록한다. 질의 텍스트·데이터 내용은 없다. 반복 실패가 보이면 이 파일로 회귀를 의심한다.

스키마·포털HTML·클라이언트 흐름이 실제로 바뀐 경우에만 관측을 기록한다:

```text
node scripts/gotgan.mjs learn --kind schema --target catalog --summary "관측 요약" --evidence "재현 가능한 비민감 근거"
```

사용자 질의, serviceKey, 개인정보는 절대 기록하지 않는다. 기록 후 `node scripts/gotgan.mjs evolve` — 라이브 카나리 재검증에 통과해야만 설치된 스킬이 갱신된다. candidate 관측은 재현 테스트 전에 정본 지침이 되지 않는다.
