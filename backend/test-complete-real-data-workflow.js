// Comprehensive test script for real data workflow
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { generateTicketForBooking, sendWhatsAppTicket, extractBookingData } = require('./enhanced-ticket-utils-fixed');

const BASE_URL = 'http://localhost:3000';

async function testCompleteRealDataWorkflow() {
  console.log('🎯 Testing Complete Real Data Workflow for GoldenMiddle');
  console.log('=' .repeat(60));
  
  try {
    // 1. Load real booking data from bookings.json
    console.log('\n1️⃣ Loading real booking data from bookings.json...');
    const bookingsPath = path.join(__dirname, 'bookings.json');
    
    if (!fs.existsSync(bookingsPath)) {
      console.log('⚠️ bookings.json not found, creating test booking...');
      await createTestBooking();
      return;
    }
    
    const bookingsData = JSON.parse(fs.readFileSync(bookingsPath, 'utf8'));
    console.log(`✅ Loaded ${Object.keys(bookingsData).length} bookings from file`);
    
    // Find a booking with real data
    const realBooking = Object.values(bookingsData).find(booking => 
      booking.firstName && booking.lastName && booking.status === 'paid'
    );
    
    if (!realBooking) {
      console.log('⚠️ No real booking data found, creating test booking...');
      await createTestBooking();
      return;
    }
    
    console.log('✅ Found real booking data:', {
      id: realBooking.id,
      firstName: realBooking.firstName,
      lastName: realBooking.lastName,
      table: realBooking.table,
      seat: realBooking.seat,
      phone: realBooking.phone,
      status: realBooking.status,
      ticketId: realBooking.ticketId
    });
    
    // 2. Test data extraction
    console.log('\n2️⃣ Testing data extraction...');
    const extractedData = extractBookingData(realBooking);
    console.log('✅ Extracted data:', extractedData);
    
    // 3. Test ticket generation with real data
    console.log('\n3️⃣ Testing ticket generation with real data...');
    const ticketResult = await generateTicketForBooking(realBooking);
    console.log('✅ Ticket generated:', {
      ticketId: ticketResult.ticketId,
      fullName: ticketResult.fullName,
      table: ticketResult.table,
      seat: ticketResult.seat,
      path: ticketResult.path,
      localPath: ticketResult.localPath
    });
    
    // 4. Test server health
    console.log('\n4️⃣ Testing server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Server health:', healthResponse.data);
    
    // 5. Test GreenAPI health
    console.log('\n5️⃣ Testing GreenAPI health...');
    try {
      const greenApiHealthResponse = await axios.get(`${BASE_URL}/api/health/greenapi`);
      console.log('✅ GreenAPI health:', greenApiHealthResponse.data);
    } catch (error) {
      console.log('⚠️ GreenAPI health check failed:', error.message);
    }
    
    // 6. Test WhatsApp sending with real data
    console.log('\n6️⃣ Testing WhatsApp sending with real data...');
    const whatsappTicket = {
      ticketId: ticketResult.ticketId,
      pdfUrl: `https://upbeat-compassion-production.up.railway.app${ticketResult.path}`,
      firstName: ticketResult.fullName,
      table: ticketResult.table,
      seat: ticketResult.seat
    };
    
    console.log('📱 WhatsApp ticket data:', whatsappTicket);
    
    const whatsappResult = await sendWhatsAppTicket(realBooking.phone, whatsappTicket);
    console.log('✅ WhatsApp result:', {
      success: whatsappResult.success,
      message: whatsappResult.message,
      textMessageId: whatsappResult.textMessageId,
      pdfMessageId: whatsappResult.pdfMessageId
    });
    
    // 7. Test complete workflow with server
    console.log('\n7️⃣ Testing complete workflow with server...');
    await testServerWorkflow();
    
    console.log('\n🎉 Complete real data workflow test completed successfully!');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('❌ Test failed:', error.response ? error.response.data : error.message);
    console.error('Stack trace:', error.stack);
  }
}

async function createTestBooking() {
  console.log('\n📝 Creating test booking with real data...');
  
  try {
    // 1. Check server health
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Server health:', healthResponse.data);

    // 2. Create a test booking with real data
    const testBookingData = {
      studentName: 'Asylbek Aitbaev',
      phone: '+996507224140',
      table: 5,
      seat: 10
    };

    const bookingResponse = await axios.post(`${BASE_URL}/api/create-booking`, testBookingData);
    console.log('✅ Test booking created:', bookingResponse.data);
    const bookingId = bookingResponse.data.bookingId;
    
    // 3. Simulate user payment confirmation
    const paymentData = {
      seatId: `${testBookingData.table}-${testBookingData.seat}`,
      phone: testBookingData.phone,
      studentName: testBookingData.studentName
    };

    const paymentResponse = await axios.post(`${BASE_URL}/api/user-payment-confirm`, paymentData);
    console.log('✅ Payment confirmed:', paymentResponse.data);

    // 4. Simulate admin payment confirmation
    const adminConfirmData = {
      bookingId: bookingId,
      paymentMethod: 'manual',
      amount: 5500
    };
    
    const adminResponse = await axios.post(`${BASE_URL}/api/confirm-payment`, adminConfirmData);
    console.log('✅ Admin confirmation:', adminResponse.data);
    
    if (adminResponse.data.success) {
      console.log('✅ Complete workflow test successful!');
      console.log('📋 Results:', {
        ticketId: adminResponse.data.ticketId,
        ticketPath: adminResponse.data.ticketPath,
        whatsappSuccess: adminResponse.data.whatsappResult?.success
      });
    }
    
  } catch (error) {
    console.error('❌ Test booking creation failed:', error.response ? error.response.data : error.message);
  }
}

async function testServerWorkflow() {
  console.log('\n🔄 Testing server workflow...');
  
  try {
    // Create a new booking
    const bookingData = {
      studentName: 'Test User Real',
      phone: '+996555123456',
      table: 15,
      seat: 25
    };

    const bookingResponse = await axios.post(`${BASE_URL}/api/create-booking`, bookingData);
    console.log('✅ Booking created:', bookingResponse.data);
    
    // Confirm payment
    const paymentData = {
      seatId: `${bookingData.table}-${bookingData.seat}`,
      phone: bookingData.phone,
      studentName: bookingData.studentName
    };

    const paymentResponse = await axios.post(`${BASE_URL}/api/user-payment-confirm`, paymentData);
    console.log('✅ Payment confirmed:', paymentResponse.data);
    
    // Admin confirm payment
    const adminConfirmData = {
      bookingId: bookingResponse.data.bookingId,
      paymentMethod: 'manual',
      amount: 5500
    };
    
    const adminResponse = await axios.post(`${BASE_URL}/api/confirm-payment`, adminConfirmData);
    console.log('✅ Admin confirmation:', adminResponse.data);
    
    // Verify ticket generation
    if (adminResponse.data.ticketId && adminResponse.data.ticketId !== 'N/A') {
      console.log('✅ Ticket generated with real ticketId:', adminResponse.data.ticketId);
    } else {
      console.log('❌ Ticket generation failed or returned N/A');
    }
    
    // Verify WhatsApp sending
    if (adminResponse.data.whatsappResult?.success) {
      console.log('✅ WhatsApp message sent successfully');
    } else {
      console.log('❌ WhatsApp sending failed:', adminResponse.data.whatsappResult?.error);
    }
    
  } catch (error) {
    console.error('❌ Server workflow test failed:', error.response ? error.response.data : error.message);
  }
}

// Run the test
if (require.main === module) {
  testCompleteRealDataWorkflow();
}

module.exports = { testCompleteRealDataWorkflow };
