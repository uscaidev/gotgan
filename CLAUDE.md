# CLAUDE.md

곳간은 공공데이터포털(data.go.kr) 개방목록을 검색하고 활용 가능성을 판단하는 MCP 서버다.

초기 설치:

```powershell
npm install
npm run setup
```

인덱스가 없으면 사용자가 data.go.kr에서 「공공데이터포털 목록개방현황」 최신 CSV를 내려받아야 한다.

```powershell
npm run build-index -- <목록개방현황.csv>
npm run smoke
npm run doctor -- --live
```

Claude Code 등록:

```powershell
claude mcp add gotgan --scope user -- node "<REPO>\scripts\run-stdio.mjs"
```

곳간은 serviceKey를 보관하지 않고 원천 API를 대신 호출하지 않는다. 검색 결과의 `as_of`, 도구 `status`, `missing_fields`를 먼저 확인한다.
