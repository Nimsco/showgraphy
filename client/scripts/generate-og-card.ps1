$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$outputPath = Join-Path $PSScriptRoot '..\public\showgraphy-card.png'
$bitmap = [System.Drawing.Bitmap]::new(1200, 630)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#11101A'))

$violet = [System.Drawing.ColorTranslator]::FromHtml('#A78BFA')
$coral = [System.Drawing.ColorTranslator]::FromHtml('#FF8E83')
$ink = [System.Drawing.ColorTranslator]::FromHtml('#F6F3FC')
$muted = [System.Drawing.ColorTranslator]::FromHtml('#B0AABD')
$surface = [System.Drawing.ColorTranslator]::FromHtml('#1B1926')
$line = [System.Drawing.ColorTranslator]::FromHtml('#302D3C')
$graphics.DrawLine([System.Drawing.Pen]::new($line, 1), 0, 515, 1200, 515)
$graphics.DrawEllipse([System.Drawing.Pen]::new($line, 1), 695, 76, 470, 470)
$graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#1B1926')), 695, 76, 470, 470)

$framePen = [System.Drawing.Pen]::new($violet, 2)
$graphics.FillRectangle([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#242133')), 789, 153, 244, 344)
$graphics.DrawRectangle($framePen, 789, 153, 244, 344)
$graphics.FillRectangle([System.Drawing.SolidBrush]::new($surface), 875, 132, 244, 344)
$graphics.DrawRectangle([System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#777285'), 2), 875, 132, 244, 344)
$graphics.DrawCurve([System.Drawing.Pen]::new($coral, 4), [System.Drawing.Point[]]@(
  [System.Drawing.Point]::new(895, 401), [System.Drawing.Point]::new(952, 324),
  [System.Drawing.Point]::new(1013, 290), [System.Drawing.Point]::new(1090, 366)
), 0.3)

$serif = [System.Drawing.Font]::new('Georgia', 88, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$serifItalic = [System.Drawing.Font]::new('Georgia', 88, [System.Drawing.FontStyle]::Italic, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = [System.Drawing.Font]::new('Arial', 17, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = [System.Drawing.Font]::new('Arial', 23, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$brandFont = [System.Drawing.Font]::new('Georgia', 26, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('A PERSONAL WATCH JOURNAL', $labelFont, [System.Drawing.SolidBrush]::new($violet), 84, 104)
$graphics.DrawString('Your life,', $serif, [System.Drawing.SolidBrush]::new($ink), 78, 198)
$graphics.DrawString('in titles.', $serifItalic, [System.Drawing.SolidBrush]::new($ink), 78, 306)
$graphics.DrawString('A private archive for the stories you watch.', $bodyFont, [System.Drawing.SolidBrush]::new($muted), 84, 438)
$graphics.DrawString('showgraphy', $brandFont, [System.Drawing.SolidBrush]::new($ink), 84, 558)

$bitmap.Save([System.IO.Path]::GetFullPath($outputPath), [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
