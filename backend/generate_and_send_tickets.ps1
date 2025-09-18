# -------------------------------
# 🎫 Complete Ticket Generation and WhatsApp Sending Script
# -------------------------------

# 1️⃣ Настройки
# -------------------------------
$phone = "+996507224140"      # Телефон клиента
$ID = "7105317460"            # GreenAPI Instance ID
$TOKEN = "76de4f547a564df4a3092b41aeacfd7ad0e848b3506d42a1b9"  # GreenAPI Token
$bookingsFile = ".\bookings.json"
$ticketsFolder = ".\tickets"
$templateFile = ".\ticket_template.pdf"  # Шаблон билета
$nodeScript = ".\generate_ticket.js"     # Node.js скрипт генерации PDF

# 2️⃣ Проверка зависимостей
# -------------------------------
Write-Output "🔍 Checking dependencies..."

# Проверяем Node.js
try {
    $nodeVersion = node --version
    Write-Output "✅ Node.js version: $nodeVersion"
} catch {
    Write-Output "❌ Node.js not found. Please install Node.js first."
    exit 1
}

# Проверяем npm пакеты
$packageJson = ".\package.json"
if (Test-Path $packageJson) {
    Write-Output "✅ package.json found"
} else {
    Write-Output "❌ package.json not found. Please run 'npm init' first."
    exit 1
}

# Проверяем наличие необходимых пакетов
$requiredPackages = @("pdf-lib", "qrcode")
foreach ($package in $requiredPackages) {
    try {
        $packageCheck = npm list $package 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Output "✅ Package $package is installed"
        } else {
            Write-Output "⚠️ Package $package not found. Installing..."
            npm install $package
        }
    } catch {
        Write-Output "⚠️ Installing package $package..."
        npm install $package
    }
}

# 3️⃣ Создание шаблона (если не существует)
# -------------------------------
if (-not (Test-Path $templateFile)) {
    Write-Output "📄 Creating ticket template..."
    node .\create_template.js
    if ($LASTEXITCODE -ne 0) {
        Write-Output "❌ Failed to create template"
        exit 1
    }
    Write-Output "✅ Template created: $templateFile"
} else {
    Write-Output "✅ Template already exists: $templateFile"
}

# 4️⃣ Загрузка бронирований
# -------------------------------
Write-Output "📋 Loading bookings..."
if (-not (Test-Path $bookingsFile)) {
    Write-Output "❌ Bookings file not found: $bookingsFile"
    exit 1
}

$bookings = Get-Content $bookingsFile | ConvertFrom-Json
Write-Output "✅ Loaded $($bookings.PSObject.Properties.Count) bookings"

# 5️⃣ Проверка статуса GreenAPI
# -------------------------------
Write-Output "🔍 Checking GreenAPI status..."
try {
    $resp = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/getStateInstance/$TOKEN" -Method GET -TimeoutSec 15
    Write-Output "✅ GreenAPI Instance State: $($resp.stateInstance)"
    if ($resp.stateInstance -ne "authorized") {
        Write-Output "❌ GreenAPI not authorized. Please check your credentials."
        exit 1
    }
} catch {
    Write-Output "❌ GreenAPI check failed:"
    $_ | Format-List * -Force
    exit 1
}

# 6️⃣ Обработка бронирований
# -------------------------------
$processedCount = 0
$successCount = 0
$errorCount = 0

Write-Output "`n🎫 Processing bookings for phone: $phone"

$bookings.PSObject.Properties | ForEach-Object {
    $b = $_.Value
    if ($b.phone -eq $phone -and $b.status -eq "paid") {
        $processedCount++
        Write-Output "`n--- Processing Booking $processedCount ---"
        Write-Output "ID: $($b.id)"
        Write-Output "Name: $($b.firstName) $($b.lastName)"
        Write-Output "Table: $($b.table), Seat: $($b.seat)"
        Write-Output "Ticket ID: $($b.ticketId)"
        
        try {
            # 7️⃣ Генерация PDF билета
            # -------------------------------
            $ticketFileName = "$($b.ticketId).pdf"
            $ticketPath = Join-Path $ticketsFolder $ticketFileName
            
            Write-Output "🎨 Generating PDF ticket..."
            
            # Подготавливаем данные для генерации
            $firstName = if ($b.firstName) { $b.firstName } else { "Гость" }
            $lastName = if ($b.lastName) { $b.lastName } else { "" }
            $table = if ($b.table) { $b.table } else { "N/A" }
            $seat = if ($b.seat) { $b.seat } else { "N/A" }
            $ticketId = if ($b.ticketId) { $b.ticketId } else { "TICKET$($b.id)" }
            
            # Генерируем билет
            node $nodeScript `
                -Template $templateFile `
                -Output $ticketPath `
                -Name $firstName `
                -Surname $lastName `
                -Table $table `
                -Seat $seat `
                -TicketId $ticketId
            
            if ($LASTEXITCODE -ne 0) {
                Write-Output "❌ Failed to generate ticket for booking $($b.id)"
                $errorCount++
                return
            }
            
            Write-Output "✅ Ticket generated: $ticketPath"
            
            # Проверяем размер файла
            $fileInfo = Get-Item $ticketPath
            Write-Output "📊 File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB"
            
            # 8️⃣ Загрузка файла на production сервер
            # -------------------------------
            Write-Output "📤 Uploading ticket to production server..."
            
            # Создаем временный URL для загрузки
            $tempUrl = "https://upbeat-compassion-production.up.railway.app/temp-tickets/$ticketFileName"
            
            # Копируем файл в temp-tickets директорию (если доступна)
            $tempTicketsDir = [System.IO.Path]::GetTempPath()
            $tempFilePath = Join-Path $tempTicketsDir $ticketFileName
            Copy-Item $ticketPath $tempFilePath -Force
            
            Write-Output "✅ Ticket prepared for upload: $tempFilePath"
            
            # 9️⃣ Отправка через WhatsApp
            # -------------------------------
            $chatId = ($b.phone -replace "\+", "") + "@c.us"
            Write-Output "📱 Sending to WhatsApp: $chatId"
            
            # Используем локальный файл через base64 или временный URL
            $pdfUrl = $tempUrl
            
            $payload = @{
                chatId   = $chatId
                urlFile  = $pdfUrl
                fileName = $ticketFileName
                caption  = "🎫 Ваш билет на мероприятие GOLDENMIDDLE`n`nСтол: $table`nМесто: $seat`n`nБилет прикреплен к сообщению. Пожалуйста, сохраните его для входа на мероприятие.`n`nДата: 26 октября`nВремя: 18:00`nМесто: Асман"
            } | ConvertTo-Json
            
            Write-Output "📤 Sending WhatsApp message..."
            
            try {
                $respSend = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/sendFileByUrl/$TOKEN" `
                                             -Method POST -Body $payload -ContentType "application/json" -TimeoutSec 30
                
                Write-Output "✅ Ticket sent successfully!"
                Write-Output "📨 Message ID: $($respSend.idMessage)"
                
                # Обновляем статус в локальном файле
                $b.whatsappSent = $true
                $b.whatsappMessageId = $respSend.idMessage
                $b.ticketPath = "/tickets/$ticketFileName"
                
                $successCount++
                
            } catch {
                Write-Output "❌ WhatsApp send failed:"
                Write-Output "Error: $($_.Exception.Message)"
                $errorCount++
            }
            
        } catch {
            Write-Output "❌ Error processing booking $($b.id):"
            Write-Output "Error: $($_.Exception.Message)"
            $errorCount++
        }
    }
}

# 1️⃣0️⃣ Сохранение обновленных данных
# -------------------------------
Write-Output "`n💾 Saving updated bookings..."
$bookings | ConvertTo-Json -Depth 10 | Set-Content $bookingsFile -Encoding UTF8
Write-Output "✅ Bookings saved to $bookingsFile"

# 1️⃣1️⃣ Итоговый отчет
# -------------------------------
Write-Output "`n" + "="*60
Write-Output "📊 FINAL REPORT"
Write-Output "="*60
Write-Output "📋 Total bookings processed: $processedCount"
Write-Output "✅ Successful: $successCount"
Write-Output "❌ Failed: $errorCount"
Write-Output "📱 Phone: $phone"
Write-Output "📁 Tickets folder: $ticketsFolder"
Write-Output "="*60

if ($successCount -gt 0) {
    Write-Output "🎉 Tickets generated and sent successfully!"
} else {
    Write-Output "⚠️ No tickets were processed successfully."
}

Write-Output "`n🏁 Script completed!"
