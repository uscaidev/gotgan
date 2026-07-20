param(
  [string]$Repo = (Resolve-Path "$PSScriptRoot\..\..").Path
)

$runner = Join-Path $Repo "scripts\run-stdio.mjs"
codex mcp add gotgan -- node $runner
