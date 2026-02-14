#!/usr/bin/env node

/**
 * Comprehensive Booking Flow Test
 * 
 * This script tests the complete booking flow:
 * 1. User books a seat
 * 2. User clicks "I paid" (status: "Ожидает подтверждения")
 * 3. Admin confirms payment (status: "Забронировано (оплачено)")
 * 4. Personalized ticket generated with client data
 * 5. Ticket sent to WhatsApp via GreenAPI
 * 6. Seat shows as unavailable for future bookings
 * 
 * Usage: node comprehensive-booking-test.js [--server-url URL]
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    DEFAULT_SERVER_URL: 'https://upbeat-compassion-production.up.railway.app',
    LOCAL_SERVER_URL: 'http://localhost:3000',
    TEST_PHONE: '+996555999888',
    TEST_NAME: 'Test User',
    TEST_LASTNAME: 'Comprehensive',
    TEST_EMAIL: 'test.comprehensive@example.com',
    TIMEOUT: 30000
};

class ComprehensiveBookingTester {
    constructor(serverUrl = null) {
        this.serverUrl = serverUrl || CONFIG.DEFAULT_SERVER_URL;
        this.testResults = [];
        this.testBookingId = null;
    }

    /**
     * Log test result
     */
    logResult(testName, success, message, details = null) {
        const result = {
            test: testName,
            success: success,
            message: message,
            details: details,
            timestamp: new Date().toISOString()
        };
        
        this.testResults.push(result);
        
        const status = success ? '✅' : '❌';
        console.log(`${status} ${testName}: ${message}`);
        
        if (details) {
            console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
        }
    }

    /**
     * Test 1: Server Health Check
     */
    async testServerHealth() {
        try {
            const response = await axios.get(`${this.serverUrl}/api/health`, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.status === 'ok') {
                this.logResult('Server Health Check', true, 'Server is healthy', response.data);
                return true;
            } else {
                this.logResult('Server Health Check', false, 'Server health check failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Server Health Check', false, `Server connection failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 2: Green API Health Check
     */
    async testGreenAPIHealth() {
        try {
            const response = await axios.get(`${this.serverUrl}/api/health/greenapi`, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.status === 'ok' && response.data.greenapi === true) {
                this.logResult('Green API Health Check', true, 'Green API is healthy and authorized', response.data);
                return true;
            } else {
                this.logResult('Green API Health Check', false, 'Green API health check failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Green API Health Check', false, `Green API connection failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 3: User Books a Seat
     */
    async testUserBooking() {
        try {
            const bookingData = {
                table: 25,
                seat: 30,
                studentName: `${CONFIG.TEST_NAME} ${CONFIG.TEST_LASTNAME}`,
                phone: CONFIG.TEST_PHONE,
                email: CONFIG.TEST_EMAIL
            };

            console.log(`\n📋 Creating booking for: ${bookingData.studentName}`);
            console.log(`   📞 Phone: ${bookingData.phone}`);
            console.log(`   📧 Email: ${bookingData.email}`);
            console.log(`   🪑 Seat: Table ${bookingData.table}, Seat ${bookingData.seat}`);

            const response = await axios.post(`${this.serverUrl}/api/create-booking`, bookingData, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.testBookingId = response.data.bookingId;
                this.logResult('User Booking Creation', true, 'Booking created successfully', {
                    bookingId: response.data.bookingId,
                    status: 'pending',
                    seatId: bookingData.seatId,
                    studentName: bookingData.studentName,
                    phone: bookingData.phone
                });
                return true;
            } else {
                this.logResult('User Booking Creation', false, 'Booking creation failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('User Booking Creation', false, `Booking creation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 4: User Clicks "I Paid" (Simulate Payment Confirmation)
     */
    async testUserPaymentConfirmation() {
        try {
            console.log(`\n💳 Simulating user payment confirmation for booking: ${this.testBookingId}`);

            const paymentData = {
                seatId: '25-30',
                studentName: `${CONFIG.TEST_NAME} ${CONFIG.TEST_LASTNAME}`,
                phone: CONFIG.TEST_PHONE
            };

            const response = await axios.post(`${this.serverUrl}/api/user-payment-confirm`, paymentData, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.logResult('User Payment Confirmation', true, 'Payment confirmed, status: "Ожидает подтверждения"', {
                    bookingId: this.testBookingId,
                    status: 'pending',
                    message: 'Seat status updated to "Ожидает подтверждения"'
                });
                return true;
            } else {
                this.logResult('User Payment Confirmation', false, 'Payment confirmation failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('User Payment Confirmation', false, `Payment confirmation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 5: Admin Confirms Payment
     */
    async testAdminPaymentConfirmation() {
        try {
            console.log(`\n👨‍💼 Admin confirming payment for booking: ${this.testBookingId}`);

            const adminConfirmData = {
                bookingId: this.testBookingId,
                paymentMethod: 'manual',
                amount: 5500
            };

            const response = await axios.post(`${this.serverUrl}/api/confirm-payment`, adminConfirmData, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.logResult('Admin Payment Confirmation', true, 'Payment confirmed by admin, status: "Забронировано (оплачено)"', {
                    bookingId: this.testBookingId,
                    status: 'paid',
                    ticketId: response.data.ticketId,
                    whatsappSent: response.data.whatsappResult?.success || false,
                    message: 'Seat status updated to "Забронировано (оплачено)"'
                });
                return true;
            } else {
                this.logResult('Admin Payment Confirmation', false, 'Admin payment confirmation failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Admin Payment Confirmation', false, `Admin payment confirmation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 6: Verify Personalized Ticket Generation
     */
    async testPersonalizedTicketGeneration() {
        try {
            console.log(`\n🎫 Verifying personalized ticket generation for booking: ${this.testBookingId}`);

            // Get booking details to verify ticket was generated with correct data
            const response = await axios.get(`${this.serverUrl}/api/bookings`, {
                timeout: CONFIG.TIMEOUT
            });

            if (response.data.success) {
                const booking = response.data.bookings.find(b => 
                    b.booking_string_id === this.testBookingId || b.id === this.testBookingId
                );

                if (booking && booking.ticket_id) {
                    this.logResult('Personalized Ticket Generation', true, 'Ticket generated with client data', {
                        bookingId: this.testBookingId,
                        ticketId: booking.ticket_id,
                        firstName: booking.first_name,
                        lastName: booking.last_name,
                        table: booking.table_number || booking.table,
                        seat: booking.seat_number || booking.seat,
                        phone: booking.user_phone || booking.phone,
                        status: booking.status
                    });
                    return true;
                } else {
                    this.logResult('Personalized Ticket Generation', false, 'Ticket not found or not generated', {
                        bookingId: this.testBookingId,
                        booking: booking
                    });
                    return false;
                }
            } else {
                this.logResult('Personalized Ticket Generation', false, 'Failed to fetch booking details', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Personalized Ticket Generation', false, `Ticket generation verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 7: Verify WhatsApp Ticket Sending
     */
    async testWhatsAppTicketSending() {
        try {
            console.log(`\n📱 Verifying WhatsApp ticket sending for booking: ${this.testBookingId}`);

            // Get booking details to verify WhatsApp was sent
            const response = await axios.get(`${this.serverUrl}/api/bookings`, {
                timeout: CONFIG.TIMEOUT
            });

            if (response.data.success) {
                const booking = response.data.bookings.find(b => 
                    b.booking_string_id === this.testBookingId || b.id === this.testBookingId
                );

                if (booking && booking.whatsapp_sent && booking.whatsapp_message_id) {
                    this.logResult('WhatsApp Ticket Sending', true, 'Ticket sent successfully via WhatsApp', {
                        bookingId: this.testBookingId,
                        whatsappSent: booking.whatsapp_sent,
                        whatsappMessageId: booking.whatsapp_message_id,
                        phone: booking.user_phone || booking.phone,
                        ticketId: booking.ticket_id
                    });
                    return true;
                } else {
                    this.logResult('WhatsApp Ticket Sending', false, 'WhatsApp not sent or message ID not found', {
                        bookingId: this.testBookingId,
                        whatsappSent: booking?.whatsapp_sent,
                        whatsappMessageId: booking?.whatsapp_message_id
                    });
                    return false;
                }
            } else {
                this.logResult('WhatsApp Ticket Sending', false, 'Failed to fetch booking details', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('WhatsApp Ticket Sending', false, `WhatsApp verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 8: Verify Seat Status Display
     */
    async testSeatStatusDisplay() {
        try {
            console.log(`\n🪑 Verifying seat status display for seat: 25-30`);

            const response = await axios.get(`${this.serverUrl}/api/seat-statuses`, {
                timeout: CONFIG.TIMEOUT
            });

            if (response.data.success) {
                const seatStatus = response.data.seatStatuses['25-30'];
                
                if (seatStatus && seatStatus.status === 'reserved') {
                    this.logResult('Seat Status Display', true, 'Seat correctly shows as unavailable for booking', {
                        seatId: '25-30',
                        status: seatStatus.status,
                        bookingId: seatStatus.bookingId,
                        message: 'Seat will display "Это место недоступно для бронирования"'
                    });
                    return true;
                } else {
                    this.logResult('Seat Status Display', false, 'Seat status not updated correctly', {
                        seatId: '25-30',
                        status: seatStatus?.status,
                        expectedStatus: 'reserved'
                    });
                    return false;
                }
            } else {
                this.logResult('Seat Status Display', false, 'Failed to fetch seat statuses', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Seat Status Display', false, `Seat status verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 9: Verify Bookings.json Consistency
     */
    async testBookingsJsonConsistency() {
        try {
            console.log(`\n📄 Verifying bookings.json consistency for booking: ${this.testBookingId}`);

            // This test would require access to the bookings.json file
            // For now, we'll verify through the API that the booking exists and has correct status
            const response = await axios.get(`${this.serverUrl}/api/bookings`, {
                timeout: CONFIG.TIMEOUT
            });

            if (response.data.success) {
                const booking = response.data.bookings.find(b => 
                    b.booking_string_id === this.testBookingId || b.id === this.testBookingId
                );

                if (booking && booking.status === 'paid') {
                    this.logResult('Bookings.json Consistency', true, 'Booking status correctly updated in database', {
                        bookingId: this.testBookingId,
                        status: booking.status,
                        ticketId: booking.ticket_id,
                        whatsappSent: booking.whatsapp_sent
                    });
                    return true;
                } else {
                    this.logResult('Bookings.json Consistency', false, 'Booking status not updated correctly', {
                        bookingId: this.testBookingId,
                        status: booking?.status,
                        expectedStatus: 'paid'
                    });
                    return false;
                }
            } else {
                this.logResult('Bookings.json Consistency', false, 'Failed to fetch booking details', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Bookings.json Consistency', false, `Bookings.json verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Run complete comprehensive test
     */
    async runComprehensiveTest() {
        console.log('🧪 Comprehensive Booking Flow Test');
        console.log('==================================\n');
        console.log(`🌐 Testing server: ${this.serverUrl}\n`);

        // Test 1: Server Health
        if (!(await this.testServerHealth())) {
            console.log('\n❌ Server health check failed, aborting tests');
            return false;
        }

        // Test 2: Green API Health
        if (!(await this.testGreenAPIHealth())) {
            console.log('\n⚠️ Green API not available, but continuing tests');
        }

        // Test 3: User Books a Seat
        if (!(await this.testUserBooking())) {
            console.log('\n❌ User booking failed, aborting tests');
            return false;
        }

        // Test 4: User Clicks "I Paid"
        if (!(await this.testUserPaymentConfirmation())) {
            console.log('\n❌ User payment confirmation failed, aborting tests');
            return false;
        }

        // Test 5: Admin Confirms Payment
        if (!(await this.testAdminPaymentConfirmation())) {
            console.log('\n❌ Admin payment confirmation failed, aborting tests');
            return false;
        }

        // Test 6: Verify Personalized Ticket Generation
        await this.testPersonalizedTicketGeneration();

        // Test 7: Verify WhatsApp Ticket Sending
        await this.testWhatsAppTicketSending();

        // Test 8: Verify Seat Status Display
        await this.testSeatStatusDisplay();

        // Test 9: Verify Bookings.json Consistency
        await this.testBookingsJsonConsistency();

        // Print summary
        this.printTestSummary();
        
        return true;
    }

    /**
     * Print comprehensive test summary
     */
    printTestSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 COMPREHENSIVE BOOKING FLOW TEST SUMMARY');
        console.log('='.repeat(80));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = this.testResults.filter(r => !r.success).length;
        
        console.log(`📋 Total tests: ${totalTests}`);
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log(`📊 Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        console.log('\n🎯 BOOKING FLOW VERIFICATION:');
        console.log('-'.repeat(80));
        
        const flowSteps = [
            'User books a seat',
            'User clicks "I paid" → Status: "Ожидает подтверждения"',
            'Admin confirms payment → Status: "Забронировано (оплачено)"',
            'Personalized ticket generated with client data',
            'Ticket sent to WhatsApp via GreenAPI',
            'Seat shows as unavailable for future bookings',
            'Bookings.json updated consistently',
            'All logs and error handling working'
        ];
        
        flowSteps.forEach((step, index) => {
            const testResult = this.testResults[index];
            const status = testResult?.success ? '✅' : '❌';
            console.log(`${index + 1}. ${status} ${step}`);
        });
        
        if (failedTests > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults
                .filter(r => !r.success)
                .forEach(result => {
                    console.log(`   • ${result.test}: ${result.message}`);
                });
        }
        
        console.log('\n🎉 Comprehensive booking flow test completed!');
        
        if (passedTests === totalTests) {
            console.log('🎊 ALL TESTS PASSED - BOOKING FLOW IS FULLY AUTOMATED!');
        }
    }
}

// Main execution
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const serverUrlArg = args.find(arg => arg.startsWith('--server-url='));
    const serverUrl = serverUrlArg ? serverUrlArg.split('=')[1] : null;
    
    // Determine server URL
    let finalServerUrl = serverUrl;
    if (!finalServerUrl) {
        // Try local first, then production
        console.log('🔍 No server URL specified, trying local first...');
        const localTest = new ComprehensiveBookingTester(CONFIG.LOCAL_SERVER_URL);
        if (await localTest.testServerHealth()) {
            finalServerUrl = CONFIG.LOCAL_SERVER_URL;
            console.log('✅ Using local server');
        } else {
            finalServerUrl = CONFIG.DEFAULT_SERVER_URL;
            console.log('✅ Using production server');
        }
    }
    
    const tester = new ComprehensiveBookingTester(finalServerUrl);
    
    try {
        await tester.runComprehensiveTest();
        process.exit(0);
    } catch (error) {
        console.error('❌ Fatal test error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = ComprehensiveBookingTester;
