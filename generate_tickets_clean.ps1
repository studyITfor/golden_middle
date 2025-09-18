# Complete Ticket Generation and WhatsApp Sending Script

# 1️⃣ Settings
# -------------------------------
$phone = "+996507224140"      # Client phone
$ID = "7105317460"            # GreenAPI Instance ID
$TOKEN = "76de4f547a564df4a3092b41aeacfd7ad0e848b3506d42a1b9"  # GreenAPI Token
$bookingsFile = ".\bookings.json"
$ticketsFolder = ".\tickets"
$nodeScript = ".\generate_ticket.js"     # Node.js PDF generation script
$templatePdf = ".\ticket_design.pdf"
$templatePng = ".\ticket_design.png"

# 2️⃣ Check dependencies
# -------------------------------
Write-Output "Checking dependencies..."

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Output "✅ Node.js version: $nodeVersion"
} catch {
    Write-Output "❌ Node.js not found. Please install Node.js first."
    exit 1
}

# Check if template exists
$templateFile = $null
if (Test-Path $templatePdf) {
    $templateFile = $templatePdf
    Write-Output "✅ PDF template found: $templatePdf"
} elseif (Test-Path $templatePng) {
    $templateFile = $templatePng
    Write-Output "✅ PNG template found: $templatePng"
} else {
    Write-Output "❌ No template found. Please provide either $templatePdf or $templatePng"
    Write-Output "Creating default template..."
    node .\create_template.js
    if (Test-Path ".\ticket_template.pdf") {
        $templateFile = ".\ticket_template.pdf"
        Write-Output "✅ Default template created: $templateFile"
    } else {
        Write-Output "❌ Failed to create default template"
        exit 1
    }
}

# 3️⃣ Load bookings
# -------------------------------
Write-Output "📋 Loading bookings..."
if (-not (Test-Path $bookingsFile)) {
    Write-Output "❌ Bookings file not found: $bookingsFile"
    exit 1
}

$bookings = Get-Content $bookingsFile | ConvertFrom-Json
Write-Output "✅ Loaded $($bookings.PSObject.Properties.Count) bookings"

# 4️⃣ Check GreenAPI status
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

# 5️⃣ Process bookings
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
            # 6️⃣ Generate PDF ticket
            # -------------------------------
            $ticketFileName = "$($b.ticketId).pdf"
            $ticketPath = Join-Path $ticketsFolder $ticketFileName
            
            Write-Output "🎨 Generating PDF ticket..."
            
            # Prepare data for generation
            $firstName = if ($b.firstName) { $b.firstName } else { "Guest" }
            $lastName = if ($b.lastName) { $b.lastName } else { "" }
            $table = if ($b.table) { $b.table } else { "N/A" }
            $seat = if ($b.seat) { $b.seat } else { "N/A" }
            $ticketId = if ($b.ticketId) { $b.ticketId } else { "TICKET$($b.id)" }
            
            # Generate ticket with all parameters
            node $nodeScript `
                -Template $templateFile `
                -Output $ticketPath `
                -Name $firstName `
                -Surname $lastName `
                -Table $table `
                -Seat $seat `
                -Date "26 October 2025" `
                -Time "18:00" `
                -Place "Asman" `
                -Price "5500 Som" `
                -TicketId $ticketId
            
            if ($LASTEXITCODE -ne 0) {
                Write-Output "❌ Failed to generate ticket for booking $($b.id)"
                $errorCount++
                return
            }
            
            Write-Output "✅ Ticket generated: $ticketPath"
            
            # Check file size
            $fileInfo = Get-Item $ticketPath
            Write-Output "📊 File size: $([math]::Round($fileInfo.Length / 1KB, 2)) KB"
            
            # 7️⃣ Send via WhatsApp
            # -------------------------------
            $chatId = ($b.phone -replace "\+", "") + "@c.us"
            Write-Output "📱 Sending to WhatsApp: $chatId"
            
            # Use production server URL for the ticket
            $pdfUrl = "https://upbeat-compassion-production.up.railway.app/tickets/$ticketFileName"
            
            $payload = @{
                chatId = $chatId
                urlFile = $pdfUrl
                fileName = $ticketFileName
                caption = "Hello, $firstName!`n`nYour golden ticket for GOLDENMIDDLE is ready!`n`nDate: 26 October 2025`nTime: 18:00`nPlace: Asman`nYour seat: Table $table, Seat $seat`nPrice: 5500 Som`nTicket ID: $ticketId`n`nTicket is attached. Please show it at the event entrance!`n`nWelcome to GOLDENMIDDLE!"
            } | ConvertTo-Json
            
            Write-Output "📤 Sending WhatsApp message..."
            
            try {
                $respSend = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/sendFileByUrl/$TOKEN" -Method POST -Body $payload -ContentType "application/json" -TimeoutSec 30
                
                Write-Output "✅ Ticket sent successfully!"
                Write-Output "📨 Message ID: $($respSend.idMessage)"
                
                # Update booking status
                $b.whatsappSent = $true
                $b.whatsappMessageId = $respSend.idMessage
                $b.ticketPath = "/tickets/$ticketFileName"
                
                $successCount++
                
            } catch {
                Write-Output "❌ WhatsApp send failed:"
                Write-Output "Error: $($_.Exception.Message)"
                
                # Try with fallback URL
                Write-Output "🔄 Trying with fallback URL..."
                $fallbackUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
                $fallbackPayload = @{
                    chatId = $chatId
                    urlFile = $fallbackUrl
                    fileName = $ticketFileName
                    caption = "Hello, $firstName!`n`nYour golden ticket for GOLDENMIDDLE is ready!`n`nDate: 26 October 2025`nTime: 18:00`nPlace: Asman`nYour seat: Table $table, Seat $seat`nPrice: 5500 Som`nTicket ID: $ticketId`n`nTicket is attached. Please show it at the event entrance!`n`nWelcome to GOLDENMIDDLE!"
                } | ConvertTo-Json
                
                try {
                    $fallbackResp = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/sendFileByUrl/$TOKEN" -Method POST -Body $fallbackPayload -ContentType "application/json" -TimeoutSec 30
                    Write-Output "✅ Fallback ticket sent successfully! Message ID: $($fallbackResp.idMessage)"
                    
                    # Update booking status
                    $b.whatsappSent = $true
                    $b.whatsappMessageId = $fallbackResp.idMessage
                    $b.ticketPath = "/tickets/$ticketFileName"
                    
                    $successCount++
                } catch {
                    Write-Output "❌ Fallback also failed: $($_.Exception.Message)"
                    $errorCount++
                }
            }
            
        } catch {
            Write-Output "❌ Error processing booking $($b.id):"
            Write-Output "Error: $($_.Exception.Message)"
            $errorCount++
        }
    }
}

# 8️⃣ Save updated data
# -------------------------------
Write-Output "`n💾 Saving updated bookings..."
$bookings | ConvertTo-Json -Depth 10 | Set-Content $bookingsFile -Encoding UTF8
Write-Output "✅ Bookings saved to $bookingsFile"

# 9️⃣ Final report
# -------------------------------
Write-Output "`n" + "="*60
Write-Output "📊 FINAL REPORT"
Write-Output "="*60
Write-Output "📋 Total bookings processed: $processedCount"
Write-Output "✅ Successful: $successCount"
Write-Output "❌ Failed: $errorCount"
Write-Output "📱 Phone: $phone"
Write-Output "📁 Tickets folder: $ticketsFolder"
Write-Output "📄 Template used: $templateFile"
Write-Output "="*60

if ($successCount -gt 0) {
    Write-Output "🎉 Tickets generated and sent successfully!"
} else {
    Write-Output "⚠️ No tickets were processed successfully."
}

Write-Output "`n🏁 Script completed!"
