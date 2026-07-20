# AGENTS.md

이 저장소는 곳간 공공데이터 MCP다. 사용자가 GitHub URL만 주면 다음 순서로 진행한다.

1. 지속적으로 사용할 폴더에 clone한다.
2. Node.js 20 이상인지 확인한다.
3. `npm install`을 실행한다.
4. `npm run setup` 또는 `node scripts/gotgan.mjs setup --json`을 실행한다.
5. `index_missing`이면 data.go.kr에서 「공공데이터포털 목록개방현황」 최신 CSV가 필요하다고 안내한다.
6. CSV가 있으면 `npm run build-index -- <csv>`를 실행하고 `npm run smoke`로 검색 레인을 확인한다.
7. `npm run doctor -- --live`로 온라인 상세페이지 카나리를 검증한다.
8. Codex/Claude에는 `node <REPO>/scripts/run-stdio.mjs`를 MCP 서버로 등록한다.

절대 하지 말 것:

- serviceKey, 토큰, 개인정보를 저장소나 로그에 남기지 않는다.
- 요청주소나 파라미터를 추정 생성하지 않는다.
- `fetch_error`를 데이터 부존재로 번역하지 않는다.
- 스냅샷 기준일 없이 "현재 개방 중"이라고 단정하지 않는다.
