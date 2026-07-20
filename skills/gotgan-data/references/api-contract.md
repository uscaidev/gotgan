# API Contract

## 도구와 상태코드

| 도구 | 레인 | 성공 status | 실패 status |
|---|---|---|---|
| `search_dataset` | 오프라인 | ok, low_confidence, no_match | index_missing |
| `get_dataset_detail` | 오프라인 | ok, no_match | index_missing |
| `get_api_spec` | 온라인 | ok, parse_partial | fetch_error, parse_failed, invalid_input |
| `build_usage_guide` | 로컬 | ok, partial | invalid_input |

no_match·low_confidence·parse_partial은 **정직한 성공**이다 — 실패로 집계·보고하지 않는다.

## 스냅샷 계약

- 검색 응답의 `as_of`는 목록개방현황 원본 파일명(월간 스냅샷)이다.
- "현재 개방 중"이라는 단정은 as_of 없이는 금지.
- 스냅샷 이후 신규 개방/폐지 가능성은 항상 열어둔다.

## 필드 추출 계약 (get_api_spec)

추출 대상: 요청주소, 서비스URL, 활용승인절차, 신청가능트래픽, API유형, 데이터포맷, 비용부과유무, 이용허락범위.
`missing_fields`에 있는 항목은 **모른다**가 정답이다. 추정 보충 금지.
첨부 기술문서는 v0.1에서 링크만 제공 — 본문 파라미터는 사용자가 문서에서 확정한다.
