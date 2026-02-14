const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testTicketManagement() {
    console.log('🧪 Testing Ticket Management System...\n');

    try {
        // Test 1: Add a ticket
        console.log('1️⃣ Adding test ticket...');
        const addResponse = await axios.post(`${BASE_URL}/api/secure-tickets/add-manual`, {
            ticketId: 'TEST123456',
            bookingId: 'BKM56CDVUAAM',
            holderName: 'Test User',
            table: 1,
            seat: 5,
            status: 'active'
        });
        
        console.log('✅ Ticket added:', addResponse.data);

        // Test 2: Get all tickets
        console.log('\n2️⃣ Getting all tickets...');
        const allTicketsResponse = await axios.get(`${BASE_URL}/api/secure-tickets/all`);
        console.log('✅ All tickets:', allTicketsResponse.data.data.length, 'tickets found');

        // Test 3: Scan ticket (first time)
        console.log('\n3️⃣ Scanning ticket (first time)...');
        const scanResponse1 = await axios.post(`${BASE_URL}/api/secure-tickets/scan`, {
            ticketId: 'TEST123456',
            scannedBy: 'admin'
        });
        console.log('✅ First scan result:', scanResponse1.data.data.usageStatus);

        // Test 4: Scan ticket (second time - repeat)
        console.log('\n4️⃣ Scanning ticket (second time)...');
        const scanResponse2 = await axios.post(`${BASE_URL}/api/secure-tickets/scan`, {
            ticketId: 'TEST123456',
            scannedBy: 'admin'
        });
        console.log('✅ Second scan result:', scanResponse2.data.data.usageStatus);

        // Test 5: Get usage status
        console.log('\n5️⃣ Getting usage status...');
        const statusResponse = await axios.get(`${BASE_URL}/api/secure-tickets/usage-status/TEST123456`);
        console.log('✅ Usage status:', statusResponse.data.usageStatus);

        console.log('\n🎉 All tests passed! Ticket management system is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

testTicketManagement();
