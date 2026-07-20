param(
  [string]$Repo = (Resolve-Path "$PSScriptRoot\..\..").Path
)

$runner = Join-Path $Repo "scripts\run-stdio.mjs"
claude mcp add gotgan --scope user -- node $runner
