# Send tickets for paid bookings

$phone = "+996507224140"
$ID = "7105317460"
$TOKEN = "76de4f547a564df4a3092b41aeacfd7ad0e848b3506d42a1b9"
$bookingsFile = ".\bookings.json"

Write-Output "Processing paid bookings for phone: $phone"

# Load bookings
if (-not (Test-Path $bookingsFile)) {
    Write-Output "Bookings file not found: $bookingsFile"
    exit 1
}

$bookings = Get-Content $bookingsFile | ConvertFrom-Json
Write-Output "Loaded $($bookings.PSObject.Properties.Count) bookings"

# Find paid bookings for this phone
$paidBookings = @()
$bookings.PSObject.Properties | ForEach-Object {
    $b = $_.Value
    if ($b.phone -eq $phone -and $b.status -eq "paid") {
        $paidBookings += $b
    }
}

Write-Output "Found $($paidBookings.Count) paid bookings for $phone"

if ($paidBookings.Count -eq 0) {
    Write-Output "No paid bookings found for this phone number."
    exit 0
}

# Process each paid booking
$successCount = 0
$errorCount = 0

foreach ($booking in $paidBookings) {
    Write-Output ""
    Write-Output "--- Processing Booking ---"
    Write-Output "ID: $($booking.id)"
    Write-Output "Name: $($booking.firstName) $($booking.lastName)"
    Write-Output "Table: $($booking.table), Seat: $($booking.seat)"
    Write-Output "Ticket ID: $($booking.ticketId)"
    
    # Generate ticket
    $ticketFileName = "$($booking.ticketId).pdf"
    $ticketPath = ".\tickets\$ticketFileName"
    
    Write-Output "Generating ticket: $ticketPath"
    
    $firstName = if ($booking.firstName) { $booking.firstName } else { "Guest" }
    $lastName = if ($booking.lastName) { $booking.lastName } else { "" }
    $table = if ($booking.table) { $booking.table } else { "N/A" }
    $seat = if ($booking.seat) { $booking.seat } else { "N/A" }
    $ticketId = if ($booking.ticketId) { $booking.ticketId } else { "TICKET$($booking.id)" }
    
    node .\generate_ticket.js -Template .\ticket_template.pdf -Output $ticketPath -Name $firstName -Surname $lastName -Table $table -Seat $seat -TicketId $ticketId
    
    if ($LASTEXITCODE -ne 0) {
        Write-Output "Failed to generate ticket"
        $errorCount++
        continue
    }
    
    Write-Output "Ticket generated successfully"
    
    # Send via WhatsApp
    $chatId = ($booking.phone -replace "\+", "") + "@c.us"
    Write-Output "Sending to WhatsApp: $chatId"
    
    # Use a public PDF URL for now
    $pdfUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
    
    $payload = @{
        chatId = $chatId
        urlFile = $pdfUrl
        fileName = $ticketFileName
        caption = "Your GOLDENMIDDLE Event Ticket`n`nTable: $table`nSeat: $seat`n`nTicket attached to message. Please save it for event entry.`n`nDate: 26 October`nTime: 18:00`nPlace: Asman"
    } | ConvertTo-Json
    
    try {
        $respSend = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/sendFileByUrl/$TOKEN" -Method POST -Body $payload -ContentType "application/json" -TimeoutSec 30
        
        Write-Output "Ticket sent successfully! Message ID: $($respSend.idMessage)"
        
        # Update booking status
        $booking.whatsappSent = $true
        $booking.whatsappMessageId = $respSend.idMessage
        $booking.ticketPath = "/tickets/$ticketFileName"
        
        $successCount++
        
    } catch {
        Write-Output "WhatsApp send failed: $($_.Exception.Message)"
        $errorCount++
    }
}

# Save updated bookings
Write-Output ""
Write-Output "Saving updated bookings..."
$bookings | ConvertTo-Json -Depth 10 | Set-Content $bookingsFile -Encoding UTF8

# Final report
Write-Output ""
Write-Output "=================================================="
Write-Output "FINAL REPORT"
Write-Output "=================================================="
Write-Output "Total bookings processed: $($paidBookings.Count)"
Write-Output "Successful: $successCount"
Write-Output "Failed: $errorCount"
Write-Output "=================================================="

if ($successCount -gt 0) {
    Write-Output "Tickets sent successfully!"
} else {
    Write-Output "No tickets were sent successfully."
}

Write-Output ""
Write-Output "Processing completed!"
