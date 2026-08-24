$envContent = Get-Content .env -Encoding utf8
$anon = ($envContent | Where-Object { $_ -match '^SUPABASE_ANON_KEY=' }) -replace '^SUPABASE_ANON_KEY='
$svc  = ($envContent | Where-Object { $_ -match '^SUPABASE_SERVICE_ROLE_KEY=' }) -replace '^SUPABASE_SERVICE_ROLE_KEY='

$headers = @{
  apikey = $anon
  Authorization = "Bearer $svc"
  'Content-Type' = 'application/json'
}
try {
  $r = Invoke-WebRequest -Uri "http://localhost:8000/translate/v1/translate" -Method Post `
        -Headers $headers -Body '{"texts":["hello","welcome"],"source_lang":"en","target_lang":"zh-CN"}' `
        -TimeoutSec 25 -UseBasicParsing
  Write-Host "HTTP $($r.StatusCode): $($r.Content)"
} catch {
  $resp = $_.Exception.Response
  if ($resp) {
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host "HTTP $($resp.StatusCode): $($reader.ReadToEnd())"
  } else { Write-Host "FAIL: $($_.Exception.Message)" }
}
