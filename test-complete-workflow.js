#!/usr/bin/env node

/**
 * Complete Workflow Test
 * 
 * This script tests the complete booking workflow:
 * 1. Create a booking (pending status)
 * 2. Admin confirms payment
 * 3. Verify ticket generation and WhatsApp sending
 * 4. Verify database updates
 * 
 * Usage: node test-complete-workflow.js [--server-url URL]
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    DEFAULT_SERVER_URL: 'https://upbeat-compassion-production.up.railway.app',
    LOCAL_SERVER_URL: 'http://localhost:3000',
    TEST_PHONE: '+996555123999',
    TEST_NAME: 'Workflow Test User',
    TEST_EMAIL: 'workflow.test@example.com',
    TIMEOUT: 30000
};

class CompleteWorkflowTester {
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
     * Test 1: Create a new booking
     */
    async testCreateBooking() {
        try {
            const bookingData = {
                table: 30,
                seat: 40,
                studentName: `${CONFIG.TEST_NAME}`,
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
                this.logResult('Create Booking', true, 'Booking created successfully', {
                    bookingId: response.data.bookingId,
                    status: 'pending',
                    studentName: bookingData.studentName,
                    phone: bookingData.phone
                });
                return true;
            } else {
                this.logResult('Create Booking', false, 'Booking creation failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Create Booking', false, `Booking creation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 2: Admin confirms payment
     */
    async testAdminConfirmPayment() {
        try {
            console.log(`\n👨‍💼 Admin confirming payment for booking: ${this.testBookingId}`);

            const confirmData = {
                bookingId: this.testBookingId,
                paymentMethod: 'manual',
                amount: 5500
            };

            const response = await axios.post(`${this.serverUrl}/api/confirm-payment`, confirmData, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.logResult('Admin Confirm Payment', true, 'Payment confirmed and ticket sent', {
                    bookingId: this.testBookingId,
                    ticketId: response.data.ticketId,
                    whatsappResult: response.data.whatsappResult,
                    message: response.data.message
                });
                return true;
            } else {
                this.logResult('Admin Confirm Payment', false, 'Payment confirmation failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Admin Confirm Payment', false, `Payment confirmation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 3: Verify booking was updated in database
     */
    async testVerifyDatabaseUpdate() {
        try {
            console.log(`\n🔍 Verifying database update for booking: ${this.testBookingId}`);

            const response = await axios.get(`${this.serverUrl}/api/bookings`, {
                timeout: CONFIG.TIMEOUT
            });

            if (response.data.success) {
                const booking = response.data.bookings.find(b => 
                    b.booking_string_id === this.testBookingId || b.id === this.testBookingId
                );

                if (booking && booking.status === 'paid' && booking.ticket_id && booking.whatsapp_sent) {
                    this.logResult('Verify Database Update', true, 'Booking correctly updated in database', {
                        bookingId: this.testBookingId,
                        status: booking.status,
                        ticketId: booking.ticket_id,
                        whatsappSent: booking.whatsapp_sent,
                        whatsappMessageId: booking.whatsapp_message_id,
                        phone: booking.user_phone || booking.phone
                    });
                    return true;
                } else {
                    this.logResult('Verify Database Update', false, 'Booking not properly updated in database', {
                        bookingId: this.testBookingId,
                        booking: booking
                    });
                    return false;
                }
            } else {
                this.logResult('Verify Database Update', false, 'Failed to fetch booking details', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Verify Database Update', false, `Database verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test 4: Verify seat status is updated
     */
    async testVerifySeatStatus() {
        try {
            console.log(`\n🪑 Verifying seat status for seat: 30-40`);

            const response = await axios.get(`${this.serverUrl}/api/seat-statuses`, {
                timeout: CONFIG.TIMEOUT
            });

            if (response.data.success) {
                const seatStatus = response.data.seatStatuses['30-40'];
                
                if (seatStatus && seatStatus.status === 'reserved') {
                    this.logResult('Verify Seat Status', true, 'Seat correctly shows as reserved', {
                        seatId: '30-40',
                        status: seatStatus.status,
                        bookingId: seatStatus.bookingId
                    });
                    return true;
                } else {
                    this.logResult('Verify Seat Status', false, 'Seat status not updated correctly', {
                        seatId: '30-40',
                        status: seatStatus?.status,
                        expectedStatus: 'reserved'
                    });
                    return false;
                }
            } else {
                this.logResult('Verify Seat Status', false, 'Failed to fetch seat statuses', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Verify Seat Status', false, `Seat status verification error: ${error.message}`);
            return false;
        }
    }

    /**
     * Run complete workflow test
     */
    async runCompleteWorkflowTest() {
        console.log('🧪 Complete Workflow Test');
        console.log('========================\n');
        console.log(`🌐 Testing server: ${this.serverUrl}\n`);

        // Test 1: Create booking
        if (!(await this.testCreateBooking())) {
            console.log('\n❌ Booking creation failed, aborting tests');
            return false;
        }

        // Test 2: Admin confirms payment
        if (!(await this.testAdminConfirmPayment())) {
            console.log('\n❌ Admin payment confirmation failed, aborting tests');
            return false;
        }

        // Test 3: Verify database update
        await this.testVerifyDatabaseUpdate();

        // Test 4: Verify seat status
        await this.testVerifySeatStatus();

        // Print summary
        this.printTestSummary();
        
        return true;
    }

    /**
     * Print test summary
     */
    printTestSummary() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 COMPLETE WORKFLOW TEST SUMMARY');
        console.log('='.repeat(80));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = this.testResults.filter(r => !r.success).length;
        
        console.log(`📋 Total tests: ${totalTests}`);
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log(`📊 Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        console.log('\n🎯 WORKFLOW VERIFICATION:');
        console.log('-'.repeat(80));
        
        const workflowSteps = [
            'Create booking (pending status)',
            'Admin confirms payment',
            'Ticket generated and sent via WhatsApp',
            'Database updated with correct status',
            'Seat status updated to reserved'
        ];
        
        workflowSteps.forEach((step, index) => {
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
        
        console.log('\n🎉 Complete workflow test completed!');
        
        if (passedTests === totalTests) {
            console.log('🎊 ALL TESTS PASSED - WORKFLOW IS FULLY AUTOMATED!');
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
        const localTest = new CompleteWorkflowTester(CONFIG.LOCAL_SERVER_URL);
        if (await localTest.testServerHealth()) {
            finalServerUrl = CONFIG.LOCAL_SERVER_URL;
            console.log('✅ Using local server');
        } else {
            finalServerUrl = CONFIG.DEFAULT_SERVER_URL;
            console.log('✅ Using production server');
        }
    }
    
    const tester = new CompleteWorkflowTester(finalServerUrl);
    
    try {
        await tester.runCompleteWorkflowTest();
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

module.exports = CompleteWorkflowTester;
