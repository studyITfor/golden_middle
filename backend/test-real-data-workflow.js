// Test script for real data workflow
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function testRealDataWorkflow() {
  console.log('🎯 Testing Real Data Workflow for GoldenMiddle');
  
  try {
    // 1. Load real booking data from bookings.json
    console.log('\n1️⃣ Loading real booking data...');
    const bookingsPath = path.join(__dirname, 'bookings.json');
    const bookingsData = JSON.parse(fs.readFileSync(bookingsPath, 'utf8'));
    
    // Find a booking with real data (not null firstName/lastName)
    const realBooking = Object.values(bookingsData).find(booking => 
      booking.firstName && booking.lastName && booking.status === 'paid'
    );
    
    if (!realBooking) {
      console.log('⚠️ No real booking data found, creating test booking...');
      // Create a test booking with real data
      const testBookingData = {
        studentName: 'Asylbek Aitbaev',
        phone: '+996507224140',
        table: 5,
        seat: 10
      };
      
      const bookingResponse = await axios.post(`${BASE_URL}/api/create-booking`, testBookingData);
      console.log('✅ Test booking created:', bookingResponse.data);
      
      // Confirm payment
      const paymentData = {
        seatId: `${testBookingData.table}-${testBookingData.seat}`,
        phone: testBookingData.phone,
        studentName: testBookingData.studentName
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
      
      return;
    }
    
    console.log('✅ Found real booking data:', {
      id: realBooking.id,
      firstName: realBooking.firstName,
      lastName: realBooking.lastName,
      table: realBooking.table,
      seat: realBooking.seat,
      phone: realBooking.phone,
      status: realBooking.status
    });
    
    // 2. Test ticket generation with real data
    console.log('\n2️⃣ Testing ticket generation with real data...');
    const { generateTicketForBooking } = require('./enhanced-ticket-utils');
    
    const ticketResult = await generateTicketForBooking(realBooking);
    console.log('✅ Ticket generated:', ticketResult);
    
    // 3. Test WhatsApp sending with real data
    console.log('\n3️⃣ Testing WhatsApp sending with real data...');
    const { sendWhatsAppTicket } = require('./enhanced-ticket-utils');
    
    const whatsappTicket = {
      ticketId: ticketResult.ticketId,
      pdfUrl: `https://upbeat-compassion-production.up.railway.app${ticketResult.path}`,
      firstName: realBooking.firstName,
      table: realBooking.table,
      seat: realBooking.seat
    };
    
    const whatsappResult = await sendWhatsAppTicket(realBooking.phone, whatsappTicket);
    console.log('✅ WhatsApp result:', whatsappResult);
    
    // 4. Test server health
    console.log('\n4️⃣ Testing server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Server health:', healthResponse.data);
    
    // 5. Test GreenAPI health
    console.log('\n5️⃣ Testing GreenAPI health...');
    const greenApiHealthResponse = await axios.get(`${BASE_URL}/api/health/greenapi`);
    console.log('✅ GreenAPI health:', greenApiHealthResponse.data);
    
    console.log('\n🎉 Real data workflow test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response ? error.response.data : error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testRealDataWorkflow();
