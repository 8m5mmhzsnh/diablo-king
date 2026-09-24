# Kleiner lokaler Webserver fuer den D4 Spickzettel (nur localhost).
# Noetig, weil Browser bei file:// keine Web-Worker erlauben - die braucht die Texterkennung.
# Start ueber start.bat im App-Ordner. Beenden: Fenster schliessen oder Strg+C.
param([int]$Port = 8000)

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.wasm' = 'application/wasm'; '.gz' = 'application/octet-stream'
  '.png' = 'image/png'; '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.md' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  Write-Host "Port $Port ist belegt oder gesperrt. Anderen Port nehmen: start.bat 8123" -ForegroundColor Red
  Read-Host 'Enter zum Schliessen'
  exit 1
}
$url = "http://localhost:$Port/"
Write-Host "D4 Spickzettel laeuft auf $url" -ForegroundColor Green
Write-Host 'Dieses Fenster offen lassen. Beenden: Fenster schliessen oder Strg+C.'
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel = $rel + 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $res.StatusCode = 404
    } else {
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.AddHeader('Cache-Control', 'no-cache')
      $bytes = [IO.File]::ReadAllBytes($path)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}
