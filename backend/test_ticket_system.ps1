# Simple test script for ticket generation and WhatsApp sending

$phone = "+996507224140"
$ID = "7105317460"
$TOKEN = "76de4f547a564df4a3092b41aeacfd7ad0e848b3506d42a1b9"

Write-Output "Testing ticket generation and WhatsApp sending..."

# Test 1: Generate a test ticket
Write-Output "`n1. Generating test ticket..."
node .\generate_ticket.js -Template .\ticket_template.pdf -Output .\tickets\TEST_$(Get-Date -Format "yyyyMMdd_HHmmss").pdf -Name "Test" -Surname "User" -Table "5" -Seat "10" -TicketId "TEST$(Get-Date -Format 'HHmmss')"

if ($LASTEXITCODE -eq 0) {
    Write-Output "✅ Ticket generation successful"
} else {
    Write-Output "❌ Ticket generation failed"
    exit 1
}

# Test 2: Check GreenAPI status
Write-Output "`n2. Checking GreenAPI status..."
try {
    $resp = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/getStateInstance/$TOKEN" -Method GET -TimeoutSec 15
    Write-Output "✅ GreenAPI Status: $($resp.stateInstance)"
} catch {
    Write-Output "❌ GreenAPI check failed: $($_.Exception.Message)"
    exit 1
}

# Test 3: Send test message
Write-Output "`n3. Sending test WhatsApp message..."
$chatId = ($phone -replace "\+", "") + "@c.us"
$testMessage = "Test message from ticket system - $(Get-Date)"

$payload = @{
    chatId = $chatId
    message = $testMessage
} | ConvertTo-Json

try {
    $respSend = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/sendMessage/$TOKEN" -Method POST -Body $payload -ContentType "application/json" -TimeoutSec 30
    Write-Output "✅ Test message sent successfully! Message ID: $($respSend.idMessage)"
} catch {
    Write-Output "❌ Test message failed: $($_.Exception.Message)"
}

# Test 4: Send test PDF
Write-Output "`n4. Sending test PDF..."
$pdfUrl = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
$pdfPayload = @{
    chatId = $chatId
    urlFile = $pdfUrl
    fileName = "test.pdf"
    caption = "Test PDF from ticket system"
} | ConvertTo-Json

try {
    $respPdf = Invoke-RestMethod -Uri "https://7105.api.greenapi.com/waInstance$ID/sendFileByUrl/$TOKEN" -Method POST -Body $pdfPayload -ContentType "application/json" -TimeoutSec 30
    Write-Output "✅ Test PDF sent successfully! Message ID: $($respPdf.idMessage)"
} catch {
    Write-Output "❌ Test PDF failed: $($_.Exception.Message)"
}

Write-Output "`n🏁 Test completed!"
