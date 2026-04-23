$ErrorActionPreference = "Stop"
$firebaseCli = ".\node_modules\.bin\firebase.cmd"

function Invoke-Step {
  param(
    [string]$Label,
    [string]$Command
  )

  Write-Host $Label
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

Invoke-Step "Generating messaging service worker from .env..." "node ./scripts/generate-firebase-sw.mjs"
Invoke-Step "Installing root dependencies..." "cmd /c npm install"
Invoke-Step "Installing functions dependencies..." "cmd /c npm --prefix functions install"
Invoke-Step "Building production app..." "cmd /c npm run build"
Invoke-Step "Deploying Firestore rules and indexes..." "cmd /c $firebaseCli deploy --only firestore:rules,firestore:indexes"
Invoke-Step "Deploying Cloud Functions..." "cmd /c $firebaseCli deploy --only functions"
Invoke-Step "Deploying Hosting..." "cmd /c $firebaseCli deploy --only hosting"

Write-Host "Deploy complete."
