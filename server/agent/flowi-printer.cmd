@echo off
rem FLOWI Printer: kitchen tickets from FLOWI to the printers of this computer (USB / Windows) and to network printers (IP:9100).
rem Run it once: it copies itself to %APPDATA%\FLOWI, starts with Windows and works in the background.
setlocal
set "FLOWI_SELF=%~f0"
start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$s=[IO.File]::ReadAllText($env:FLOWI_SELF,[Text.Encoding]::UTF8); iex $s.Substring($s.IndexOf('#PS-START#'))"
exit /b
#PS-START#
$ErrorActionPreference = 'Stop'
$Base = '__BASE__'
$Token = '__TOKEN__'
$Name = '__NAME__'
$Version = '1.0'
$Dir = Join-Path $env:APPDATA 'FLOWI'
$Log = Join-Path $Dir 'printer.log'
$Self = $env:FLOWI_SELF
New-Item -ItemType Directory -Force -Path $Dir | Out-Null

function Write-Log($text) {
  try {
    if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 1MB) { Move-Item -Force $Log "$Log.old" }
    Add-Content -Path $Log -Value ("{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text) -Encoding UTF8
  } catch {}
}

# One copy only: a second start (double click, Windows start-up) quietly ends.
$mutex = New-Object System.Threading.Mutex($false, 'Local\FLOWIPrinter')
if (-not $mutex.WaitOne(0)) { exit }

# ---------- First start: copy to %APPDATA%\FLOWI and start with Windows ----------
$Installed = Join-Path $Dir 'flowi-printer.cmd'
if ($Self -and ($Self -ne $Installed)) {
  Copy-Item -Force $Self $Installed
  $startup = Join-Path ([Environment]::GetFolderPath('Startup')) 'FLOWI-Printer.cmd'
  Set-Content -Path $startup -Value "@start `"`" /min `"$Installed`"" -Encoding ASCII
  Write-Log "O'rnatildi: $Installed"
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show("FLOWI Printer o'rnatildi va ishlayapti.`n`nKompyuter yoqilganda o'zi ishga tushadi.`nPrinterlarni FLOWI → Sozlamalar → Printerlar bo'limida sozlang.", 'FLOWI Printer') | Out-Null
  } catch {}
}

# ---------- Talking to FLOWI ----------
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$Headers = @{ Authorization = "Bearer $Token" }
function Invoke-Flowi($method, $path, $body) {
  $p = @{ Method = $method; Uri = "$Base$path"; Headers = $Headers; TimeoutSec = 30; UseBasicParsing = $true }
  if ($body -ne $null) {
    $p.ContentType = 'application/json; charset=utf-8'
    $p.Body = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6 -Compress))
  }
  $r = Invoke-WebRequest @p
  $text = [Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
  if ($text) { return $text | ConvertFrom-Json }
  return $null
}

# ---------- The printers Windows knows (USB, shared, installed network printers) ----------
function Get-LocalPrinters {
  $list = @()
  try { $list = Get-CimInstance -ClassName Win32_Printer } catch { try { $list = Get-WmiObject -Class Win32_Printer } catch {} }
  $out = @()
  foreach ($p in $list) {
    if ($p.Name -match 'PDF|XPS|OneNote|Fax') { continue }
    $out += @{ name = [string]$p.Name; port = [string]$p.PortName }
  }
  return ,$out
}

# ---------- Sending bytes: to a Windows printer as RAW, or to a network printer by IP ----------
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FlowiRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] data, int len, out int written);
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "Printer ochilmadi (" + Marshal.GetLastWin32Error() + ")";
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "FLOWI"; di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) return "Chop etish boshlanmadi (" + Marshal.GetLastWin32Error() + ")";
      StartPagePrinter(h);
      int w; bool ok = WritePrinter(h, data, data.Length, out w);
      EndPagePrinter(h); EndDocPrinter(h);
      return ok && w == data.Length ? "" : "Printerga yozilmadi (" + Marshal.GetLastWin32Error() + ")";
    } finally { ClosePrinter(h); }
  }
}
'@

function Send-Net($ip, $port, [byte[]]$data) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $ar = $c.BeginConnect($ip, [int]$port, $null, $null)
    if (-not $ar.AsyncWaitHandle.WaitOne(4000)) { return "Printerga ulanib bo'lmadi: ${ip}:$port" }
    $c.EndConnect($ar)
    $s = $c.GetStream(); $s.WriteTimeout = 5000
    $s.Write($data, 0, $data.Length); $s.Flush()
    Start-Sleep -Milliseconds 300
    return ''
  } catch { return "Printerga ulanib bo'lmadi: ${ip}:$port" } finally { $c.Close() }
}

# ---------- The loop: report printers every minute, print what is waiting every 2 seconds ----------
Write-Log "Ishga tushdi ($Name, v$Version) → $Base"
$lastReport = [DateTime]::MinValue
$failures = 0
while ($true) {
  try {
    if (((Get-Date) - $lastReport).TotalSeconds -ge 60) {
      Invoke-Flowi 'POST' '/api/device/agent-report' @{ printers = (Get-LocalPrinters); version = $Version } | Out-Null
      $lastReport = Get-Date
    }
    $r = Invoke-Flowi 'GET' '/api/device/agent-jobs' $null
    foreach ($j in $r.jobs) {
      $bytes = [Convert]::FromBase64String($j.data)
      if ($j.kind -eq 'net') { $err = Send-Net $j.target $j.port $bytes } else { $err = [FlowiRaw]::Send([string]$j.target, $bytes) }
      if ($err) {
        Write-Log "XATO $($j.target): $err"
        Invoke-Flowi 'POST' '/api/device/agent-ack' @{ printer_id = $j.printer_id; error = $err } | Out-Null
      } else {
        Invoke-Flowi 'POST' '/api/device/agent-ack' @{ printer_id = $j.printer_id; upto = $j.upto } | Out-Null
      }
    }
    if ($failures -gt 0) { Write-Log 'Aloqa tiklandi' }
    $failures = 0
    if ($r.jobs.Count -gt 0) { continue }
    Start-Sleep -Seconds 2
  } catch {
    $failures++
    $msg = $_.Exception.Message
    if ($msg -match '401') { Write-Log "Kalit bekor qilingan (401). FLOWI → Sozlamalar → Printerlar'dan dasturni qaytadan yuklab oling."; Start-Sleep -Seconds 300; continue }
    if ($failures -le 3 -or $failures % 30 -eq 0) { Write-Log "Aloqa yo'q: $msg" }
    Start-Sleep -Seconds ([Math]::Min(30, 2 * $failures))
  }
}
