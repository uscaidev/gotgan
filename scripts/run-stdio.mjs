#!/usr/bin/env node
/**
 * run-stdio.mjs — MCP 클라이언트 등록용 안정 실행기.
 *
 * 클라이언트 설정에는 이 파일만 등록한다. 실제 서버 구현 파일 위치가
 * 바뀌더라도 실행기 계약을 유지하면 Codex/Claude 설정을 다시 고칠 일이 줄어든다.
 */

await import("../src/server.mjs");
