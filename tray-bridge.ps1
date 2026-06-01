#requires -version 5.1
<#
.SYNOPSIS
  CommandCode Bridge system tray manager
.DESCRIPTION
  Single GUI app that:
  - Launches and monitors commandcode-bridge (port 8788)
  - Auto-starts bridge on launch
  - Shows local bridge status
  - One auto-start entry via HKCU\Run registry
.NOTES
  Replaces old dual-bridge tray (CC Bridge 9992 + Hermes proxy 8788).
  Now manages ONLY commandcode-bridge on port 8788.
  ngrok tunnel management moved to OpenCodeTunnel app.
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http

# ═══ Hide console window ═══
Add-Type -Name Win32 -Namespace Native -MemberDefinition @"
[DllImport("kernel32.dll")]
public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")]
public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
"@
$hWnd = [Native.Win32]::GetConsoleWindow()
if ($hWnd -ne [IntPtr]::Zero) { [Native.Win32]::ShowWindow($hWnd, 0) }

# ═══ Mutex: prevent duplicate tray instances ═══
$MutexName = "Global\CommandCodeBridgeTrayMutex"
$Mutex = New-Object System.Threading.Mutex($false, $MutexName)
if (-not $Mutex.WaitOne(0)) { exit }

# ═══ Config ═══
$BridgeDir      = "C:\Users\Deign\commandcode-bridge"
$BridgePort     = 8788
$BridgeUrl      = "http://127.0.0.1:$BridgePort"
$HealthUrl      = "$BridgeUrl/health"
$DashboardUrl   = "$BridgeUrl/dashboard"
$PollIntervalMs = 5000

# ═══ HttpClient (shared, no TIME_WAIT) ═══
$HttpClient = [System.Net.Http.HttpClient]::new()
$HttpClient.Timeout = [TimeSpan]::FromSeconds(3)

# ═══ Health check ═══
function Test-BridgeHealth {
    try {
        $task = $HttpClient.GetAsync($HealthUrl)
        $task.Wait(3000)
        return ($task.IsCompleted -and $task.Result.IsSuccessStatusCode)
    } catch { return $false }
}

function Get-BridgeInfo {
    try {
        $task = $HttpClient.GetAsync($HealthUrl)
        $task.Wait(3000)
        if ($task.IsCompleted -and $task.Result.IsSuccessStatusCode) {
            return ($task.Result.Content.ReadAsStringAsync().Result | ConvertFrom-Json)
        }
    } catch {}
    return $null
}

# ═══ Bridge process management ═══
function Find-BridgeProcess {
    Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -EA Stop).CommandLine
            if ($cmd -like "*commandcode-bridge*" -or $cmd -like "*$BridgePort*") { return $_ }
        } catch {}
    }
}

function Start-Bridge {
    if (Test-BridgeHealth) { return }
    if (-not (Test-Path "$BridgeDir\dist\index.js")) {
        [System.Windows.Forms.MessageBox]::Show(
            "Bridge not built.`nRun 'npm run build' in $BridgeDir",
            "Bridge Error", 'OK', 'Error')
        return
    }
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    # Use full path to node.exe — NVM symlinks may not be in PATH at boot time
    $NodeExe = "C:\nvm4w\nodejs\node.exe"
    if (-not (Test-Path $NodeExe)) { $NodeExe = "node.exe" }  # fallback to PATH
    $psi.FileName = $NodeExe
    $psi.Arguments = "dist\index.js"
    $psi.WorkingDirectory = $BridgeDir
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    try { [Diagnostics.Process]::Start($psi) | Out-Null } catch {}
}

function Stop-Bridge {
    $proc = Find-BridgeProcess
    if ($proc) { try { $proc.Kill() } catch {} }
    Start-Sleep -Milliseconds 500
}

# ═══ Icons ═══
function New-DotIcon {
    param([Drawing.Color]$Color)
    $bmp = [Drawing.Bitmap]::new(16, 16)
    $g   = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'HighQuality'
    $g.FillEllipse([Drawing.SolidBrush]::new($Color), 1, 1, 14, 14)
    $g.Flush()
    $icon = [Drawing.Icon]::FromHandle($bmp.GetHicon())
    $g.Dispose(); $bmp.Dispose()
    return $icon
}

$IcoGreen = New-DotIcon 'LimeGreen'
$IcoGray  = New-DotIcon 'DimGray'

# ═══ Font helpers ═══
$BoldFont  = [Drawing.Font]::new("Segoe UI", 9, [Drawing.FontStyle]::Bold)
$NormFont  = [Drawing.Font]::new("Segoe UI", 9)

# ═══ Update tray state ═══
function Update-TrayState {
    $ok = Test-BridgeHealth

    # Tray icon + tooltip
    if ($ok) {
        $script:TrayIcon.Icon = $IcoGreen
        $script:TrayIcon.Text = "CC Bridge: UP"
    } else {
        $script:TrayIcon.Icon = $IcoGray
        $script:TrayIcon.Text = "CC Bridge: DOWN"
    }

    # Status labels in menu
    if ($ok) {
        $info = Get-BridgeInfo
        $ver = if ($info) { $info.version } else { "?" }
        $script:MiStatus.Text = "  Status: UP (v$ver)"
        $script:MiStatus.ForeColor = [Drawing.Color]::FromArgb(50, 205, 50)
    } else {
        $script:MiStatus.Text = "  Status: DOWN"
        $script:MiStatus.ForeColor = [Drawing.Color]::FromArgb(255, 80, 80)
    }
    $script:MiPort.Text = "  Port: $BridgePort"

    # Enable/disable menu items
    $script:MiStartBridge.Enabled  = -not $ok
    $script:MiStopBridge.Enabled   = $ok
    $script:MiDashboard.Enabled    = $ok
}

# ═══ Build tray UI ═══
function Initialize-Tray {
    $script:TrayIcon = [System.Windows.Forms.NotifyIcon]::new()
    $script:TrayIcon.Icon = $IcoGray
    $script:TrayIcon.Text = "CC Bridge"
    $script:TrayIcon.Visible = $true

    $m = [System.Windows.Forms.ContextMenuStrip]::new()

    # ── Status section (disabled, informational) ──
    function Add-StatusItem {
        param($Text, $Font=$NormFont, $Color=[Drawing.Color]::FromArgb(180,180,180))
        $mi = [System.Windows.Forms.ToolStripMenuItem]::new($Text)
        $mi.Enabled = $false
        $mi.Font = $Font
        $mi.ForeColor = $Color
        $null = $m.Items.Add($mi)
        return $mi
    }

    $title = Add-StatusItem "CommandCode Bridge" $BoldFont ([Drawing.Color]::White)
    $script:MiStatus = Add-StatusItem "  Status: ..." $NormFont
    $script:MiPort   = Add-StatusItem "  Port: ..."   $NormFont

    [void]$m.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    # ── Bridge controls ──
    $script:MiStartBridge = [System.Windows.Forms.ToolStripMenuItem]::new("Start Bridge")
    $script:MiStartBridge.Add_Click({ Start-Bridge; Start-Sleep 3; Update-TrayState })
    $null = $m.Items.Add($script:MiStartBridge)

    $script:MiStopBridge = [System.Windows.Forms.ToolStripMenuItem]::new("Stop Bridge")
    $script:MiStopBridge.Add_Click({ Stop-Bridge; Update-TrayState })
    $null = $m.Items.Add($script:MiStopBridge)

    $script:MiDashboard = [System.Windows.Forms.ToolStripMenuItem]::new("Open Dashboard")
    $script:MiDashboard.Add_Click({
        try { Start-Process $DashboardUrl } catch {}
    })
    $null = $m.Items.Add($script:MiDashboard)

    [void]$m.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    # ── Model Selector ──
    $script:ModelMenuItems = @{}

    function Add-ModelGroupHeader {
        param($Text, $Menu)
        $mi = [System.Windows.Forms.ToolStripMenuItem]::new($Text)
        $mi.Enabled = $false
        $mi.Font = $BoldFont
        $mi.ForeColor = [Drawing.Color]::FromArgb(120, 180, 255)
        $null = $Menu.Items.Add($mi)
    }

    function Toggle-Model {
        param($ModelId, $MenuItem)
        $credPath = Join-Path $env:USERPROFILE ".config\commandcode-bridge\credentials.json"
        try {
            $cred = Get-Content $credPath -Raw | ConvertFrom-Json
            foreach ($m in $cred.models) {
                if ($m.id -eq $ModelId) {
                    $m.enabled = -not $m.enabled
                    $MenuItem.Checked = $m.enabled
                    break
                }
            }
            $cred | ConvertTo-Json -Depth 10 | Set-Content $credPath -Encoding UTF8
            # Restart bridge to pick up model changes
            Stop-Bridge
            Start-Sleep 1
            Start-Bridge
            Start-Sleep 3
            Update-TrayState
        } catch {
            [System.Windows.Forms.MessageBox]::Show(
                "Failed to toggle model: $($_.Exception.Message)",
                "Model Toggle Error", 'OK', 'Error')
        }
    }

    function Build-ModelMenu {
        param($ParentMenu)
        $credPath = Join-Path $env:USERPROFILE ".config\commandcode-bridge\credentials.json"
        $premiumFamilies = @("commandcode", "claude", "gpt", "gemini")
        $premiumIds = @(
            "commandcode/taste-1",
            "anthropic/claude-opus-4.8", "anthropic/claude-opus-4.7", "anthropic/claude-opus-4.6",
            "anthropic/claude-sonnet-4.6", "anthropic/claude-haiku-4-5-20251001",
            "openai/gpt-5.5", "openai/gpt-5.4", "openai/gpt-5.4-mini", "openai/gpt-5.3-codex",
            "google/gemini-3.5-flash", "google/gemini-3.1-flash-lite"
        )
        $ossIds = @(
            "moonshotai/Kimi-K2.6", "moonshotai/Kimi-K2.5",
            "zai-org/GLM-5.1", "zai-org/GLM-5",
            "MiniMaxAI/MiniMax-M2.7", "MiniMaxAI/MiniMax-M2.5",
            "deepseek/deepseek-v4-pro", "deepseek/deepseek-v4-flash",
            "Qwen/Qwen3.6-Max-Preview", "Qwen/Qwen3.6-Plus", "alibaba/qwen3.7-max",
            "stepfun/Step-3.7-Flash", "stepfun/Step-3.5-Flash",
            "xiaomi/mimo-v2.5-pro", "xiaomi/mimo-v2.5"
        )
        try {
            $cred = Get-Content $credPath -Raw | ConvertFrom-Json
            $modelMap = @{}
            foreach ($m in $cred.models) { $modelMap[$m.id] = $m }

            Add-ModelGroupHeader "Premium Models" $ParentMenu
            foreach ($id in $premiumIds) {
                $m = $modelMap[$id]
                if (-not $m) { continue }
                $mi = [System.Windows.Forms.ToolStripMenuItem]::new($m.label)
                $mi.Checked = $m.enabled
                $mi.Tag = $id
                $mi.Add_Click({ Toggle-Model -ModelId $this.Tag -MenuItem $this })
                $null = $ParentMenu.Items.Add($mi)
                $script:ModelMenuItems[$id] = $mi
            }

            $null = $ParentMenu.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

            Add-ModelGroupHeader "Open Source Models" $ParentMenu
            foreach ($id in $ossIds) {
                $m = $modelMap[$id]
                if (-not $m) { continue }
                $mi = [System.Windows.Forms.ToolStripMenuItem]::new($m.label)
                $mi.Checked = $m.enabled
                $mi.Tag = $id
                $mi.Add_Click({ Toggle-Model -ModelId $this.Tag -MenuItem $this })
                $null = $ParentMenu.Items.Add($mi)
                $script:ModelMenuItems[$id] = $mi
            }
        } catch {
            $errMi = [System.Windows.Forms.ToolStripMenuItem]::new("Error loading models")
            $errMi.Enabled = $false
            $null = $ParentMenu.Items.Add($errMi)
        }
    }

    $script:MiModels = [System.Windows.Forms.ToolStripMenuItem]::new("Models")
    Build-ModelMenu $script:MiModels
    $null = $m.Items.Add($script:MiModels)

    $null = $m.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    # ── Auto-start toggle ──
    # Use $script: scope so event handler can resolve these at click-time
    $script:AutoStartRegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $script:AutoStartRegName = "CommandCodeBridge"
    $script:AutoStartValue  = "wscript.exe `"$BridgeDir\launch-bridge.vbs`""

    $script:MiAutoStart = [System.Windows.Forms.ToolStripMenuItem]::new("Auto-Start on Login")
    try {
        $script:MiAutoStart.Checked = $null -ne (
            Get-ItemProperty $script:AutoStartRegPath -Name $script:AutoStartRegName -EA SilentlyContinue
        )
    } catch { $script:MiAutoStart.Checked = $false }

    $script:MiAutoStart.Add_Click({
        try {
            if ($this.Checked) {
                Remove-ItemProperty $script:AutoStartRegPath -Name $script:AutoStartRegName -EA Stop
                $this.Checked = $false
            } else {
                Set-ItemProperty $script:AutoStartRegPath -Name $script:AutoStartRegName `
                    -Value $script:AutoStartValue -EA Stop
                $this.Checked = $true
            }
        } catch {
            [System.Windows.Forms.MessageBox]::Show(
                "Failed to update auto-start: $($_.Exception.Message)",
                "Registry Error", 'OK', 'Error')
        }
    })
    $null = $m.Items.Add($script:MiAutoStart)

    $null = $m.Items.Add([System.Windows.Forms.ToolStripSeparator]::new())

    # ── Exit ──
    $miExit = [System.Windows.Forms.ToolStripMenuItem]::new("Exit")
    $miExit.Add_Click({
        $script:TrayIcon.Visible = $false
        $script:PollTimer.Stop()
        $HttpClient.Dispose()
        [System.Windows.Forms.Application]::Exit()
    })
    $null = $m.Items.Add($miExit)

    $script:TrayIcon.ContextMenuStrip = $m

    # Double-click → dashboard
    $script:TrayIcon.Add_DoubleClick({
        if (Test-BridgeHealth) { try { Start-Process $DashboardUrl } catch {} }
    })

    # ── Poll timer ──
    $script:PollTimer = [System.Windows.Forms.Timer]::new()
    $script:PollTimer.Interval = $PollIntervalMs
    $script:PollTimer.Add_Tick({ Update-TrayState })
    $script:PollTimer.Start()

    # ── Init ──
    Update-TrayState

    # Auto-start bridge if not running
    if (-not (Test-BridgeHealth)) {
        Start-Bridge
        Start-Sleep 4
        Update-TrayState
    }
}

# ═══ Entry point ═══
try {
    Initialize-Tray
    [System.Windows.Forms.Application]::Run()
} catch {
    # Silent crash handler
} finally {
    if ($script:TrayIcon)  { $script:TrayIcon.Visible = $false; $script:TrayIcon.Dispose() }
    if ($script:PollTimer) { $script:PollTimer.Stop(); $script:PollTimer.Dispose() }
    if ($HttpClient)       { $HttpClient.Dispose() }
    if ($Mutex)            { $Mutex.ReleaseMutex(); $Mutex.Dispose() }
}
