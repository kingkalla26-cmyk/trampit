# auto-push.ps1 — שומר ומעלה לגיטהאב אוטומטית כל שינוי

$projectPath = "C:\Users\Admin\Desktop\טרמפים"
$git = "C:\Program Files\Git\cmd\git.exe"
$debounceSeconds = 5  # מחכה 5 שניות אחרי שינוי לפני העלאה

Set-Location $projectPath

Write-Host "✅ מערכת עדכון אוטומטית פועלת..." -ForegroundColor Green
Write-Host "📁 עוקב אחרי: $projectPath" -ForegroundColor Cyan
Write-Host "⏹  לעצור: Ctrl+C`n" -ForegroundColor Yellow

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $projectPath
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName

# קבצים שיש להתעלם מהם
$ignore = @('.git', 'node_modules', 'reports.json', 'auto-push.ps1')

$lastPush = [DateTime]::MinValue

function Should-Ignore($path) {
  foreach ($i in $ignore) {
    if ($path -like "*\$i*") { return $true }
  }
  return $false
}

function Do-Push {
  $now = Get-Date
  if (($now - $lastPush).TotalSeconds -lt $debounceSeconds) { return }
  $script:lastPush = $now

  $status = & $git status --porcelain 2>$null
  if (-not $status) { return }

  Write-Host "`n🔄 $(Get-Date -Format 'HH:mm:ss') — נמצאו שינויים, מעלה..." -ForegroundColor Cyan

  & $git add -A 2>$null
  $msg = "auto: update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  & $git commit -m $msg 2>$null

  $pushResult = & $git push origin main 2>&1
  if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ הועלה לגיטהאב בהצלחה!" -ForegroundColor Green
  } else {
    Write-Host "⚠️  בעיה בהעלאה — מנסה pull ואז push..." -ForegroundColor Yellow
    & $git pull origin main --rebase 2>$null
    & $git push origin main 2>$null
    Write-Host "✅ הועלה!" -ForegroundColor Green
  }
}

# רישום לאירועי שינוי
Register-ObjectEvent $watcher Changed -Action {
  if (-not (Should-Ignore $Event.SourceEventArgs.FullPath)) {
    Start-Sleep -Seconds $debounceSeconds
    Do-Push
  }
} | Out-Null

Register-ObjectEvent $watcher Created -Action {
  if (-not (Should-Ignore $Event.SourceEventArgs.FullPath)) {
    Start-Sleep -Seconds $debounceSeconds
    Do-Push
  }
} | Out-Null

Register-ObjectEvent $watcher Deleted -Action {
  if (-not (Should-Ignore $Event.SourceEventArgs.FullPath)) {
    Start-Sleep -Seconds $debounceSeconds
    Do-Push
  }
} | Out-Null

# לולאה שמחזיקה את הסקריפט פעיל
try {
  while ($true) { Start-Sleep -Seconds 10 }
} finally {
  $watcher.Dispose()
  Write-Host "`n⛔ מערכת העדכון האוטומטי נעצרה." -ForegroundColor Red
}
