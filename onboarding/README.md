# 곳간 온보딩: 목록개방현황 CSV 준비

곳간의 오프라인 검색 레인은 공공데이터포털의 「공공데이터포털 목록개방현황」 CSV를 로컬 인덱스로 변환해 사용한다. 이 파일이 없으면 MCP 서버는 기동할 수 있지만 `search_dataset`은 `index_missing`을 반환한다.

## 1. 최신 CSV 받기

1. data.go.kr에 접속한다.
2. 검색창에 `공공데이터포털 목록개방현황`을 입력한다.
3. 제공기관이 `공공데이터활용지원센터`인 파일데이터를 연다.
4. 최신 월분 CSV를 내려받는다.
5. 파일명을 날짜가 보이게 보관한다. 예: `목록개방현황_20260630.csv`

곳간은 원천 파일을 자동으로 조용히 내려받아 덮어쓰지 않는다. 운영자가 원천과 기준일을 확인한 뒤 인덱스를 갱신한다.

## 2. 인덱스 빌드

```powershell
npm run build-index -- 목록개방현황_20260630.csv
```

PowerShell 실행 정책 때문에 `npm.ps1`이 막히면 다음처럼 실행한다.

```powershell
npm.cmd run build-index -- 목록개방현황_20260630.csv
node scripts\build-index.mjs 목록개방현황_20260630.csv
```

빌드 결과는 `data/index/`에 생성된다.

```text
data/index/meta.json
data/index/records.jsonl
data/index/inverted.json
```

## 3. 검증

```powershell
npm run smoke
npm run doctor -- --live
```

`doctor`에서 볼 상태:

| 상태 | 의미 | 조치 |
|---|---|---|
| `index_missing` | 인덱스가 없음 | CSV로 `build-index` 실행 |
| `stale_snapshot` | 스냅샷이 오래됨 | 최신 월분 CSV로 재빌드 |
| `schema_drift` | CSV 헤더가 바뀜 | 칼럼 매핑 확인 |
| `portal_html_drift` | 상세페이지 파싱 구조가 바뀜 | `get_api_spec` 파서 점검 |
| `network_or_block` | 온라인 조회 실패 | 네트워크/차단/포털 장애 확인 |

## 4. 원천 변화 감지

```powershell
npm run monitor-source -- --json
```

처음에는 `first_seen`, 변화가 없으면 `unchanged`, 기준일·수정일·행수 힌트가 바뀌면 `changed`가 나온다. `changed`가 나오면 최신 CSV를 다시 받아 재색인한다.

스케줄러 등록 예시는 `docs/scheduler-design.md`를 본다.
