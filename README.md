# 곳간 공공데이터 MCP

곳간은 공공데이터포털(data.go.kr)의 개방목록을 검색하고, 해당 데이터가 실제 분석·시스템 연계에 쓸 수 있는지 판단하도록 돕는 읽기 중심 MCP 서버다. 단순 검색 챗봇이나 원천 API 대리 호출기가 아니다.

## 설계 방향

곳간의 제품 방향은 "공공데이터 검색"이 아니라 **목적형 공공데이터 활용 판단 엔진**이다. 사용자는 농업 보조금 검증, 용역 제안서 검토, 내부 시스템 연계, 제공기관 자기점검 같은 목적을 제시하고, 곳간은 데이터 후보, 제공형태, 갱신주기, 활용신청, 심의 유형, 트래픽, 망환경 제약을 근거로 다음 행동을 정리한다.

첫 MVP는 여러 포털을 얕게 긁지 않는다. 공공데이터포털의 **목록개방현황 월간 CSV**를 로컬 인덱스로 만들고, 필요한 경우 data.go.kr 상세페이지를 라이브 조회해 API 사용방법과 활용신청 정보를 확인한다. 인증키를 보관하거나 원천 API를 실호출하지 않으며, "없다", "모른다", "네트워크 실패", "인덱스 미구축"을 구분한다.

곳간은 갈피와 함께 쓰기 좋다. 갈피가 법령·근거·제약을 확인한다면, 곳간은 데이터 존재·형태·연계 가능성을 확인한다. 둘을 결합하면 공공데이터 활용, 용역 설계, 감사 대비 검토에서 근거와 데이터 양쪽을 확인할 수 있다.

## 처음 시작

Node.js 20 이상이 필요하다.

```powershell
git clone https://github.com/uscaidev/gotgan.git
cd gotgan
npm install
npm run setup
```

`setup`은 다음 순서로 상태를 확인한다.

1. Node.js 버전 확인
2. 패키지와 MCP SDK 설치 여부 확인
3. 스킬 원본과 클라이언트 샘플 파일 확인
4. 로컬 인덱스 존재 여부 확인
5. 온라인 검증 요청 시 data.go.kr 카나리 상세페이지 파싱 확인
6. 다음 단계가 CSV 준비인지, MCP 클라이언트 등록인지 안내

처음 설치 직후에는 검색 인덱스가 없을 수 있다. 이때 `search_dataset`은 `index_missing`을 반환한다. 최신 CSV를 받은 뒤 인덱스를 빌드한다.

```powershell
npm run build-index -- 목록개방현황_20260630.csv
npm run smoke
npm run doctor -- --live
```

PowerShell 실행 정책 때문에 `npm.ps1`이 막히면 `npm.cmd` 또는 `node`를 직접 사용한다.

```powershell
npm.cmd run setup
node scripts\gotgan.mjs doctor --live
```

## AI에게 GitHub 주소만 줄 때

다음처럼 요청하면 된다.

```text
이 GitHub 저장소를 지속적으로 사용할 폴더에 clone하고 설치해줘.
npm install 후 npm run setup을 실행해줘.
인덱스가 없으면 data.go.kr의 공공데이터포털 목록개방현황 CSV가 필요하다고 알려줘.
최신 CSV가 있으면 npm run build-index로 인덱스를 만들고, smoke와 doctor --live까지 확인한 뒤 현재 AI 도구에 MCP로 연결해줘.
```

저장소의 [AGENTS.md](AGENTS.md)와 [CLAUDE.md](CLAUDE.md)가 Codex·Claude에게 같은 초기 절차를 알려준다. 설치 뒤에는 `gotgan-data` 스킬이 검색, API 사용방법 확인, 장애 진단 절차를 제공한다.

## CSV가 없을 때

```powershell
npm run guide
```

[공공데이터포털 목록개방현황 준비 가이드](onboarding/README.md)를 따른다. 곳간은 원천 CSV를 자동으로 조용히 내려받아 덮어쓰지 않는다. 원천 목록 변화는 감지하지만, 재색인은 운영자가 CSV를 확인한 뒤 수행한다.

## 상태 확인과 복구

```powershell
npm run doctor
npm run doctor -- --live
npm run monitor-source -- --json
npm run guide
```

`doctor`는 인덱스, 스냅샷 신선도, CSV 헤더 개편, 스킬 원본, 런타임 실패 카운터를 확인한다. `--live`는 실제 data.go.kr 상세페이지 카나리를 조회해 포털 HTML 변경이나 네트워크 차단을 구분한다.

`monitor-source`는 목록개방현황 원천 페이지의 기준일, 수정일, 차기 등록 예정일, 행수 힌트만 `.gotgan/source-monitor.json`에 저장한다. 상태는 `first_seen`, `unchanged`, `changed`, `fetch_error`로 나뉜다. `fetch_error`는 원천 변경 없음이 아니라 네트워크·차단·포털 장애 가능성이다.

## 클라이언트 연결

### Codex와 Claude Code

```powershell
codex mcp add gotgan -- node "<REPO>\scripts\run-stdio.mjs"
claude mcp add gotgan --scope user -- node "<REPO>\scripts\run-stdio.mjs"
```

PowerShell 샘플은 [examples/mcp](examples/mcp)에 있다.

### Claude Desktop

[claude-desktop.json](examples/mcp/claude-desktop.json)의 절대 경로를 바꿔 MCP 설정에 추가한다.

### ChatGPT

ChatGPT는 로컬 stdio MCP에 직접 연결하지 않는다.

1. 곳간을 HTTPS MCP 엔드포인트로 배포하거나 Secure MCP Tunnel을 사용한다.
2. ChatGPT의 Developer mode를 켠다.
3. Apps 생성 화면에서 원격 MCP 주소를 등록한다.
4. `Scan Tools`에서 곳간 도구를 확인한다.

상세 체크리스트는 [chatgpt-checklist.md](examples/mcp/chatgpt-checklist.md)에 있다. 원격 공개 배포에는 TLS, 인증 프록시, 요청 제한, 비밀 저장소가 필요하다.

## 제공 도구

| MCP 도구 | 기능 |
|---|---|
| `search_dataset` | 월간 개방목록 스냅샷에서 데이터셋·오픈API 검색 |
| `get_dataset_detail` | 검색 결과 `_id`로 보유근거, 갱신주기, 차기 등록 예정일, 이용허락범위 등 전체 필드 조회 |
| `get_api_spec` | data.go.kr 상세페이지를 라이브 조회해 요청주소, 승인절차, 트래픽, 첨부 기술문서 링크 추출 |
| `build_usage_guide` | 추출된 스펙으로 활용신청 체크리스트와 serviceKey 플레이스홀더 curl 생성 |

검색 응답의 `as_of`는 월간 스냅샷 기준이다. "현재 개방 중"이라는 단정은 원문 페이지 확인 없이는 하지 않는다. `parse_partial`은 실패가 아니라 일부 필드를 모른다는 뜻이다. 누락된 요청주소나 파라미터를 추정해서 만들지 않는다.

## 아키텍처

```text
[오프라인 레인 — 폐쇄망 가용]
  목록개방현황 CSV(월간) ──build-index──▶ data/index/
                                              │
  search_dataset · get_dataset_detail ◀───────┘

[온라인 레인 — 인터넷망 전용]
  get_api_spec ──▶ data.go.kr 상세페이지 라이브 조회
  build_usage_guide ──▶ 활용신청 체크리스트 + 샘플 curl

[운영 레인]
  monitor-source ──▶ 원천 목록 변화 감지
  doctor/evolve ──▶ 카나리 검증과 스킬 갱신
```

## 설계 헌법

1. **무언 폴백 금지** — 매칭 실패 시 최상위 결과를 슬쩍 돌려주지 않는다.
2. **부존재와 실패 구분** — `no_match`, `fetch_error`, `index_missing`, `parse_partial`을 섞지 않는다.
3. **시점 정직성** — 월간 스냅샷 한계를 모든 검색 응답의 `as_of`로 노출한다.
4. **폐쇄과업 원칙** — 실호출·인증키 발급·인증키 보관은 도구 범위 밖이다.
5. **환각 0건 우선** — 모르는 요청주소·파라미터·오퍼레이션은 만들지 않는다.

## 검증 기반 학습

곳간은 사용할 때마다 질의나 데이터 내용을 저장하지 않는다. 도구별 성공·실패 횟수와 마지막 상태만 `.gotgan/runtime-learning.json`에 기록한다.

재사용할 기술적 발견이 있을 때만 후보를 남긴다.

```powershell
npm run learn -- --kind schema --target catalog --summary "관찰 내용" --evidence "개인정보 없는 재현 근거"
npm run evolve
```

`evolve`는 라이브 카나리 검증에 통과해야 설치된 Codex·Claude 스킬을 갱신한다. 후보 관측은 자동으로 기준 지식이 되지 않는다.

## 스케줄러와 원천 변화탐지

곳간은 OS 스케줄러와 `monitor-source` 명령을 결합한다. Windows 작업 스케줄러와 cron 예시는 [scheduler-design.md](docs/scheduler-design.md)에 있다.

권장 운영 흐름:

1. 매월 차기 등록 예정일 전후로 `monitor-source` 실행
2. `changed`면 최신 CSV 다운로드
3. `npm run build-index -- <csv>`로 재색인
4. `npm run smoke`와 `npm run doctor -- --live` 실행
5. 이상이 없으면 MCP 클라이언트가 새 인덱스 사용

## 개발

```powershell
npm run check
node scripts\gotgan.mjs monitor-source --json
node scripts\run-stdio.mjs
```

주요 구조:

```text
scripts/gotgan.mjs          설치·진단·가이드·학습 CLI
scripts/run-stdio.mjs       MCP 클라이언트 등록용 실행기
skills/gotgan-data/         배포용 표준 스킬 원본
src/                        검색 인덱스, 상세페이지 파서, MCP 서버
examples/mcp/               클라이언트 등록 샘플
onboarding/                 CSV 준비 가이드
docs/                       스케줄러·연계 설계·벤치마크 문서
```

## 다음 개발 후보

- `assess_linkage`: 일회성·배치·실시간 × 인터넷망·폐쇄망 × 트래픽으로 직접 API, 중계서버, 캐시, 파일 배치 반입 판정
- `make_data_dossier`: 검색 결과 하나를 데이터 활용카드로 정리
- `preview_file_data`: 파일데이터 선두 N행 인코딩·스키마 스니핑
- `find_joinable`: 행정표준코드·표준데이터 기반 결합 후보 탐색
- `watch_org_catalog`: 제공기관 자기점검과 갱신기한 도래·경과 감시

모든 결과는 공공데이터 활용 검토 보조 자료다. 최종 활용 전에는 data.go.kr 원문 페이지와 제공기관 안내를 다시 확인한다.

## 라이선스

MIT
