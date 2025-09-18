// Test script for complete GoldenMiddle booking workflow
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testCompleteWorkflow() {
  console.log('🎯 Testing Complete GoldenMiddle Booking Workflow');
  console.log('=' * 60);

  try {
    // 1. Check server health
    console.log('\n1️⃣ Checking server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Server health:', healthResponse.data);

    // 2. Create a test booking
    console.log('\n2️⃣ Creating test booking...');
    const bookingData = {
      studentName: 'Test User',
      phone: '+996507224140',
      table: 25,
      seat: 30
    };

    const bookingResponse = await axios.post(`${BASE_URL}/api/create-booking`, bookingData);
    console.log('✅ Booking created:', bookingResponse.data);
    const bookingId = bookingResponse.data.bookingId;

    // 3. Simulate user payment confirmation
    console.log('\n3️⃣ Simulating user payment confirmation...');
    const paymentData = {
      seatId: `${bookingData.table}-${bookingData.seat}`,
      phone: bookingData.phone,
      studentName: bookingData.studentName
    };

    const paymentResponse = await axios.post(`${BASE_URL}/api/user-payment-confirm`, paymentData);
    console.log('✅ Payment confirmed:', paymentResponse.data);

    // 4. Simulate admin payment confirmation (this should trigger ticket generation and WhatsApp)
    console.log('\n4️⃣ Simulating admin payment confirmation...');
    const confirmData = {
      bookingId: bookingId,
      paymentMethod: 'manual',
      amount: 5500
    };

    const confirmResponse = await axios.post(`${BASE_URL}/api/confirm-payment`, confirmData);
    console.log('✅ Payment confirmed by admin:', confirmResponse.data);

    // 5. Check booking status
    console.log('\n5️⃣ Checking final booking status...');
    const statusResponse = await axios.get(`${BASE_URL}/api/bookings`);
    const bookings = statusResponse.data;
    const ourBooking = bookings.find(b => b.bookingId === bookingId);
    
    if (ourBooking) {
      console.log('✅ Final booking status:', {
        id: ourBooking.bookingId,
        status: ourBooking.status,
        ticketId: ourBooking.ticketId,
        whatsappSent: ourBooking.whatsappSent,
        whatsappMessageId: ourBooking.whatsappMessageId,
        ticketPath: ourBooking.ticketPath
      });
    } else {
      console.log('❌ Booking not found in final status check');
    }

    console.log('\n🎉 Complete workflow test finished!');
    console.log('=' * 60);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testCompleteWorkflow();
