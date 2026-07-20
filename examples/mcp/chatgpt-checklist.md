# ChatGPT 연결 체크리스트

ChatGPT는 로컬 stdio MCP 서버에 직접 연결하지 않는다. 곳간을 ChatGPT에서 쓰려면 원격 MCP 주소가 필요하다.

## 준비

- HTTPS로 접근 가능한 MCP 엔드포인트
- TLS 인증서
- 인증 프록시 또는 베어러 토큰
- 요청 제한과 로그 마스킹
- 서버 측 환경에서만 관리되는 비밀값

곳간 v0.1은 serviceKey를 보관하거나 원천 API를 실호출하지 않지만, 공개 엔드포인트로 배포할 경우 MCP 호출 자체에 대한 인증과 제한은 필요하다.

## ChatGPT 등록

1. ChatGPT 설정에서 Developer mode를 켠다.
2. Apps 생성 화면에서 원격 MCP 주소를 입력한다.
3. `Scan Tools`를 실행한다.
4. 다음 도구가 보이는지 확인한다.

```text
search_dataset
get_dataset_detail
get_api_spec
build_usage_guide
```

## 검증 질문

```text
공공데이터포털에서 대기오염 관련 API를 찾아줘. 스냅샷 기준일과 활용신청 유의사항도 같이 알려줘.
```

응답에는 `as_of`, `status`, 원문 목록 URL, missing field 여부가 포함되어야 한다.
