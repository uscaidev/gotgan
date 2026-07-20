# 곳간 스케줄러·원천 변화탐지 설계 v0.1

곳간의 스케줄러는 원천 데이터를 마음대로 내려받아 덮어쓰는 자동 갱신기가 아니다. 운영자가 신뢰할 수 있도록 **관측 → 변화 판정 → 재색인 권고 → 검증 후 반영**의 순서를 지킨다.

## 1. 목표

1. 공공데이터포털 「목록개방현황」 원천 페이지의 변경 여부를 주기적으로 감지한다.
2. 변경이 감지되면 최신 CSV 재다운로드·재색인·검증을 안내한다.
3. 원천 페이지 장애/네트워크 차단/HTML 변경을 "데이터 변화 없음"으로 오판하지 않는다.
4. 사용자 질의, serviceKey, 다운로드 파일 본문은 저장하지 않는다.

## 2. 역할 분리

| 구성 | 책임 |
|---|---|
| `monitor-source` | 원천 페이지를 조회해 스냅샷 파일명, 수정일, 차기 등록 예정일, 행수 힌트를 비교 |
| OS 스케줄러 | `monitor-source` 명령을 정해진 시간에 실행 |
| 운영자/CI | 변경 감지 시 CSV 다운로드, `build-index`, `smoke`, `doctor --live` 실행 |
| MCP 도구 | 현재 인덱스 기준으로 검색·상세조회·활용판정 수행 |

## 3. 상태코드

| status | 의미 | 다음 행동 |
|---|---|---|
| `first_seen` | 최초 관측이라 비교 기준 없음 | 상태 저장 후 다음 주기부터 비교 |
| `unchanged` | 이전 관측값과 동일 | 기존 인덱스 유지 |
| `changed` | 파일 기준일/수정일/예정일/행수 힌트 중 변화 | 최신 CSV 확보 후 재색인 |
| `fetch_error` | 원천 페이지 조회 실패 | 네트워크/차단/포털 장애 확인 |

`fetch_error`는 "원천 변경 없음"이 아니다. 이 상태에서 자동으로 정상 판정을 내리면 안 된다.

## 4. 관측값

`.gotgan/source-monitor.json`에는 아래 비민감 관측값만 저장한다.

```json
{
  "url": "https://www.data.go.kr/data/15062804/fileData.do",
  "snapshot_ymd": "20260630",
  "registered_date": "2026-07-10",
  "modified_date": "2026-07-10",
  "next_update_date": "2026-08-14",
  "row_count_hint": 87581,
  "metadata_links": {
    "schema_org": true,
    "dcat": true
  },
  "fingerprint": "...",
  "extracted_at": "..."
}
```

## 5. 운영 주기

권장 주기는 매월 10~16일 사이 하루 1회다. 목록개방현황은 월간 자료이며, 상세 페이지에 차기 등록 예정일이 표시되므로 해당 날짜 전후로 집중 확인하면 충분하다. 평시에는 주 1회로 낮춰도 된다.

## 6. Windows 작업 스케줄러 예시

PowerShell에서 작업을 등록할 때는 실제 설치 경로로 바꾼다.

```powershell
$Action = New-ScheduledTaskAction `
  -Execute "node" `
  -Argument "scripts/gotgan.mjs monitor-source --json" `
  -WorkingDirectory "C:\path\to\gotgan-mcp"

$Trigger = New-ScheduledTaskTrigger -Daily -At 9:10AM

Register-ScheduledTask `
  -TaskName "GotganSourceMonitor" `
  -Action $Action `
  -Trigger $Trigger `
  -Description "공공데이터포털 목록개방현황 원천 변화 감지"
```

## 7. Unix cron 예시

```cron
10 9 * * * cd /opt/gotgan-mcp && node scripts/gotgan.mjs monitor-source --json >> .gotgan/source-monitor.log 2>&1
```

## 8. 변경 감지 후 절차

1. data.go.kr에서 최신 「공공데이터포털 목록개방현황」 CSV를 내려받는다.
2. `npm run build-index -- <최신CSV>` 실행.
3. `npm run smoke`로 오프라인 검색 레인을 검증.
4. `npm run doctor -- --live`로 온라인 상세페이지 카나리를 검증.
5. 검증 실패 시 실패 종류를 `schema_drift`, `portal_html_drift`, `network_or_block`으로 나누어 처리.

## 9. 향후 확장

- `diff-snapshots`: 이전 CSV와 최신 CSV의 신규·폐지·수정 목록 산출
- `watch_org_catalog`: 특정 제공기관 목록만 갱신기한 도래/경과 감시
- `notify`: 변경 감지 결과를 Slack/Teams/메일로 전송
- `auto-reindex`: 신뢰 가능한 파일 다운로드 경로가 확인된 경우에만 선택적으로 자동 재색인
