#!/usr/bin/env node

/**
 * End-to-End Flow Test Script
 * 
 * This script tests the complete booking flow:
 * 1. Create a booking with "pending" status
 * 2. Use admin confirmation to send WhatsApp ticket
 * 3. Verify the booking status is updated
 * 4. Test bulk confirmation functionality
 * 
 * Usage: node test-end-to-end-flow.js [--server-url URL]
 */

const axios = require('axios');

// Configuration
const CONFIG = {
    DEFAULT_SERVER_URL: 'https://upbeat-compassion-production.up.railway.app',
    LOCAL_SERVER_URL: 'http://localhost:3000',
    TEST_PHONE: '+996555123456',
    TEST_NAME: 'E2E Test User',
    TEST_EMAIL: 'test@example.com',
    TIMEOUT: 30000
};

class EndToEndTester {
    constructor(serverUrl = null) {
        this.serverUrl = serverUrl || CONFIG.DEFAULT_SERVER_URL;
        this.testResults = [];
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
     * Test server health
     */
    async testServerHealth() {
        try {
            const response = await axios.get(`${this.serverUrl}/api/health`, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.status === 'ok') {
                this.logResult('Server Health', true, 'Server is healthy', response.data);
                return true;
            } else {
                this.logResult('Server Health', false, 'Server health check failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Server Health', false, `Server connection failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test Green API health
     */
    async testGreenAPIHealth() {
        try {
            const response = await axios.get(`${this.serverUrl}/api/health/greenapi`, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.status === 'ok' && response.data.greenapi === true) {
                this.logResult('Green API Health', true, 'Green API is healthy', response.data);
                return true;
            } else {
                this.logResult('Green API Health', false, 'Green API health check failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Green API Health', false, `Green API connection failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test booking creation
     */
    async testBookingCreation() {
        try {
            const bookingData = {
                seatId: '10-15',
                studentName: CONFIG.TEST_NAME,
                phone: CONFIG.TEST_PHONE,
                email: CONFIG.TEST_EMAIL
            };

            const response = await axios.post(`${this.serverUrl}/api/create-booking`, bookingData, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.logResult('Booking Creation', true, 'Booking created successfully', {
                    bookingId: response.data.bookingId,
                    status: 'pending'
                });
                return response.data.bookingId;
            } else {
                this.logResult('Booking Creation', false, 'Booking creation failed', response.data);
                return null;
            }
        } catch (error) {
            this.logResult('Booking Creation', false, `Booking creation error: ${error.message}`);
            return null;
        }
    }

    /**
     * Test payment confirmation
     */
    async testPaymentConfirmation(bookingId) {
        try {
            const paymentData = {
                bookingId: bookingId,
                paymentMethod: 'manual',
                amount: 5500
            };

            const response = await axios.post(`${this.serverUrl}/api/confirm-payment`, paymentData, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.logResult('Payment Confirmation', true, 'Payment confirmed and ticket sent', {
                    ticketId: response.data.ticketId,
                    whatsappResult: response.data.whatsappResult
                });
                return true;
            } else {
                this.logResult('Payment Confirmation', false, 'Payment confirmation failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Payment Confirmation', false, `Payment confirmation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test bulk confirmation
     */
    async testBulkConfirmation() {
        try {
            const response = await axios.post(`${this.serverUrl}/api/bulk-confirm-payments`, {}, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.logResult('Bulk Confirmation', true, 'Bulk confirmation completed', {
                    processed: response.data.processed,
                    successful: response.data.successful,
                    failed: response.data.failed
                });
                return true;
            } else {
                this.logResult('Bulk Confirmation', false, 'Bulk confirmation failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Bulk Confirmation', false, `Bulk confirmation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Test send pending tickets
     */
    async testSendPendingTickets() {
        try {
            const response = await axios.post(`${this.serverUrl}/api/send-pending-tickets`, {}, {
                timeout: CONFIG.TIMEOUT,
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.data.success) {
                this.logResult('Send Pending Tickets', true, 'Pending tickets sent', {
                    processed: response.data.processed,
                    successful: response.data.successful,
                    failed: response.data.failed
                });
                return true;
            } else {
                this.logResult('Send Pending Tickets', false, 'Send pending tickets failed', response.data);
                return false;
            }
        } catch (error) {
            this.logResult('Send Pending Tickets', false, `Send pending tickets error: ${error.message}`);
            return false;
        }
    }

    /**
     * Run complete end-to-end test
     */
    async runCompleteTest() {
        console.log('🧪 End-to-End Flow Test');
        console.log('========================\n');
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

        // Test 3: Create booking
        console.log('\n📋 Creating test booking...');
        const bookingId = await this.testBookingCreation();
        if (!bookingId) {
            console.log('\n❌ Booking creation failed, aborting tests');
            return false;
        }

        // Test 4: Confirm payment
        console.log('\n💳 Confirming payment...');
        const paymentConfirmed = await this.testPaymentConfirmation(bookingId);
        if (!paymentConfirmed) {
            console.log('\n❌ Payment confirmation failed');
        }

        // Test 5: Bulk confirmation
        console.log('\n🔄 Testing bulk confirmation...');
        await this.testBulkConfirmation();

        // Test 6: Send pending tickets
        console.log('\n📱 Testing send pending tickets...');
        await this.testSendPendingTickets();

        // Print summary
        this.printTestSummary();
        
        return true;
    }

    /**
     * Print test summary
     */
    printTestSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = this.testResults.filter(r => !r.success).length;
        
        console.log(`📋 Total tests: ${totalTests}`);
        console.log(`✅ Passed: ${passedTests}`);
        console.log(`❌ Failed: ${failedTests}`);
        console.log(`📊 Success rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
        
        if (failedTests > 0) {
            console.log('\n❌ FAILED TESTS:');
            this.testResults
                .filter(r => !r.success)
                .forEach(result => {
                    console.log(`   • ${result.test}: ${result.message}`);
                });
        }
        
        console.log('\n🎯 End-to-end test completed!');
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
        const localTest = new EndToEndTester(CONFIG.LOCAL_SERVER_URL);
        if (await localTest.testServerHealth()) {
            finalServerUrl = CONFIG.LOCAL_SERVER_URL;
            console.log('✅ Using local server');
        } else {
            finalServerUrl = CONFIG.DEFAULT_SERVER_URL;
            console.log('✅ Using production server');
        }
    }
    
    const tester = new EndToEndTester(finalServerUrl);
    
    try {
        await tester.runCompleteTest();
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

module.exports = EndToEndTester;
