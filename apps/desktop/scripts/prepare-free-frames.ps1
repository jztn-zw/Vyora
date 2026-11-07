# Generate catalog metadata and small picker previews from the shipped PNGs.
# Original / full-resolution artwork is never rewritten by this script.
$ErrorActionPreference = 'Stop'
$desktopRoot = Split-Path $PSScriptRoot -Parent
$assetDirectory = Join-Path $desktopRoot 'assets/free-frames'
$audit = & (Join-Path $PSScriptRoot 'inspect-frame-alpha.ps1') -Directory $assetDirectory | ConvertFrom-Json
$families = [ordered]@{
  'luxury' = 'VYORA Classic'
  'film' = 'VYORA Film 400'
  'urban-pop' = 'VYORA Urban Pop'
  'neon' = 'VYORA Neon Orbit'
  'good-vibes' = 'VYORA Good Vibes'
  'vintage' = 'VYORA Vintage Memories'
  'pink' = 'VYORA Pink Friends'
  'flash-notes' = 'VYORA Flash Notes'
  'night-index' = 'VYORA Night Index'
  'lavender-retro' = 'VYORA Lavender Retro'
  'booth-chronicle' = 'VYORA Booth Chronicle'
}
$nativeCounts = @{ 'flash-notes'=4; 'night-index'=3; 'lavender-retro'=3; 'booth-chronicle'=4 }
$entries = @()
foreach ($family in $families.Keys) {
  $counts = if ($nativeCounts.ContainsKey($family)) { @($nativeCounts[$family]) } else { 2..4 }
  foreach ($count in $counts) {
    $file = "$family-$count.png"
    $info = $audit | Where-Object file -eq $file
    if (!$info -or $info.areas.Count -ne $count) { throw "Wrong number of transparent openings: $file" }
    $slots = @($info.areas | Sort-Object y,x | ForEach-Object {
      # Small bleed under the alpha edge prevents white hairlines around photos.
      $pad = if ($file -eq 'neon-4.png') { 12 } else { 3 }
      $left = [Math]::Max(0, $_.x - $pad)
      $top = [Math]::Max(0, $_.y - $pad)
      $right = [Math]::Min($info.width, $_.x + $_.width + $pad)
      $bottom = [Math]::Min($info.height, $_.y + $_.height + $pad)
      [ordered]@{ x=$left/$info.width; y=$top/$info.height; width=($right-$left)/$info.width; height=($bottom-$top)/$info.height }
    })
    $previewFile = "$family-$count-preview.png"
    $source = [System.Drawing.Bitmap]::FromFile((Join-Path $assetDirectory $file))
    $thumb = [System.Drawing.Bitmap]::new([int][Math]::Round(240 * $source.Width / $source.Height), 240)
    $graphics = [System.Drawing.Graphics]::FromImage($thumb)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($source, 0, 0, $thumb.Width, $thumb.Height)
    $graphics.Dispose()
    $thumb.Save((Join-Path $assetDirectory $previewFile), [System.Drawing.Imaging.ImageFormat]::Png)
    $thumb.Dispose()
    $source.Dispose()
    $entries += [ordered]@{ id="vyora-free-$family-$count"; name="$($families[$family]) · $count photos"; width=$info.width; height=$info.height; slots=$slots; file=$file; preview=$previewFile }
  }
}
$entries | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $assetDirectory 'index.json') -Encoding utf8NoBOM

# A diagnostic contact sheet renders numbered photo placeholders behind each PNG.
$columns = 7
$rows = [int][Math]::Ceiling($entries.Count / $columns)
$sheet = [System.Drawing.Bitmap]::new($columns * 200, $rows * 330)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml('#1e1b24'))
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font = [System.Drawing.Font]::new('Segoe UI', 10)
$numberFont = [System.Drawing.Font]::new('Segoe UI', 16, [System.Drawing.FontStyle]::Bold)
$colors = @('#d9cbea','#c0dce9','#f0d8c5','#cce0d2')
for ($entryIndex=0; $entryIndex -lt $entries.Count; $entryIndex++) {
    $column = $entryIndex % $columns
    $row = [int][Math]::Floor($entryIndex / $columns)
    $entry = $entries[$entryIndex]
    $height = 275.0
    $width = [Math]::Min(178, $height * $entry.width / $entry.height)
    $height = $width * $entry.height / $entry.width
    $x = $column * 200 + (200-$width)/2
    $y = $row * 330 + 12
    $g.FillRectangle([System.Drawing.Brushes]::White, [single]$x, [single]$y, [single]$width, [single]$height)
    $index=0
    foreach ($slot in $entry.slots) {
      $sx=$x+$slot.x*$width; $sy=$y+$slot.y*$height; $sw=$slot.width*$width; $sh=$slot.height*$height
      $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($colors[$index]))
      $g.FillRectangle($brush, [single]$sx, [single]$sy, [single]$sw, [single]$sh)
      $brush.Dispose()
      $personBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#75657f'))
      $diameter=[Math]::Min($sw*.2, $sh*.27)
      $g.FillEllipse($personBrush, [single]($sx+$sw/2-$diameter/2), [single]($sy+$sh*.15), [single]$diameter, [single]$diameter)
      $g.FillEllipse($personBrush, [single]($sx+$sw*.3), [single]($sy+$sh*.48), [single]($sw*.4), [single]($sh*.5))
      $g.DrawString(($index+1).ToString(), $numberFont, [System.Drawing.Brushes]::White, [single]($sx+$sw/2-7), [single]($sy+$sh*.49))
      $personBrush.Dispose()
      $index++
    }
    $source = [System.Drawing.Bitmap]::FromFile((Join-Path $assetDirectory $entry.file))
    $g.DrawImage($source, [single]$x, [single]$y, [single]$width, [single]$height)
    $source.Dispose()
    $g.DrawString($entry.name, $font, [System.Drawing.Brushes]::White, [single]($column*200+8), [single]($row*330+294))
}
$g.Dispose(); $font.Dispose(); $numberFont.Dispose()
$sheet.Save((Join-Path $desktopRoot 'out/free-frame-collection-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$sheet.Dispose()
Write-Output "Prepared $($entries.Count) frames and picker previews."
