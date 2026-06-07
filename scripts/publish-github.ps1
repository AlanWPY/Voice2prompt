$ErrorActionPreference = "Stop"

$repoUrl = "https://github.com/AlanWPY/Voice2prompt.git"

git config user.name "AlanWPY"
git config user.email "414244982@qq.com"
git config --global credential.helper manager

$origin = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($origin)) {
  git remote add origin $repoUrl
} elseif ($origin -ne $repoUrl) {
  git remote set-url origin $repoUrl
}

$connection = Test-NetConnection github.com -Port 443 -WarningAction SilentlyContinue
if (-not $connection.TcpTestSucceeded) {
  throw "Cannot connect to github.com:443. Check network, VPN, proxy, or firewall before pushing."
}

git push -u origin main
