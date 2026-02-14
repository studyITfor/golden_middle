#!/usr/bin/env node

/**
 * Auto Confirm Bookings Script
 * 
 * This script uses the existing server API endpoints to automatically
 * process pending bookings and send WhatsApp tickets.
 * 
 * Usage: node auto-confirm-bookings.js [--server-url URL]
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    DEFAULT_SERVER_URL: 'https://upbeat-compassion-production.up.railway.app',
    LOCAL_SERVER_URL: 'http://localhost:3000',
    DELAY_BETWEEN_REQUESTS: 2000, // 2 seconds
    MAX_RETRIES: 3,
    TIMEOUT: 30000 // 30 seconds
};

class AutoConfirmBookings {
    constructor(serverUrl = null) {
        this.serverUrl = serverUrl || CONFIG.DEFAULT_SERVER_URL;
        this.processedCount = 0;
        this.successCount = 0;
        this.failureCount = 0;
        this.results = [];
    }

    /**
     * Test server connectivity
     */
    async testServerConnection() {
        try {
            console.log(`🔍 Testing connection to ${this.serverUrl}...`);
            const response = await axios.get(`${this.serverUrl}/api/health`, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.status === 'ok') {
                console.log('✅ Server connection successful');
                return true;
            } else {
                console.log('❌ Server health check failed');
                return false;
            }
        } catch (error) {
            console.error(`❌ Server connection failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test Green API connectivity
     */
    async testGreenAPIConnection() {
        try {
            console.log('🔍 Testing Green API connection...');
            const response = await axios.get(`${this.serverUrl}/api/health/greenapi`, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.status === 'ok' && response.data.greenapi === true) {
                console.log('✅ Green API connection successful');
                return true;
            } else {
                console.log('❌ Green API health check failed');
                return false;
            }
        } catch (error) {
            console.error(`❌ Green API connection failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get all bookings from server
     */
    async getAllBookings() {
        try {
            console.log('📋 Fetching all bookings from server...');
            const response = await axios.get(`${this.serverUrl}/api/admin/bookings`, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.success) {
                console.log(`✅ Retrieved ${response.data.bookings.length} bookings`);
                return response.data.bookings;
            } else {
                throw new Error(response.data.message || 'Failed to fetch bookings');
            }
        } catch (error) {
            console.error(`❌ Error fetching bookings: ${error.message}`);
            return [];
        }
    }

    /**
     * Find pending bookings
     */
    findPendingBookings(bookings) {
        return bookings.filter(booking => 
            booking.status === 'pending' || 
            booking.status === 'Ожидает подтверждения' ||
            booking.status === ' ' || // Garbled text
            (booking.status && booking.status.includes('подтверждения'))
        );
    }

    /**
     * Process bulk confirmation using server endpoint
     */
    async processBulkConfirmation() {
        try {
            console.log('🔄 Processing bulk confirmation via server API...');
            const response = await axios.post(`${this.serverUrl}/api/bulk-confirm-payments`, {}, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.success) {
                console.log('✅ Bulk confirmation completed');
                console.log(`   📋 Processed: ${response.data.processed}`);
                console.log(`   ✅ Successful: ${response.data.successful}`);
                console.log(`   ❌ Failed: ${response.data.failed}`);
                
                this.processedCount = response.data.processed;
                this.successCount = response.data.successful;
                this.failureCount = response.data.failed;
                this.results = response.data.results || [];
                
                return true;
            } else {
                throw new Error(response.data.message || 'Bulk confirmation failed');
            }
        } catch (error) {
            console.error(`❌ Bulk confirmation error: ${error.message}`);
            return false;
        }
    }

    /**
     * Send pending tickets using server endpoint
     */
    async sendPendingTickets() {
        try {
            console.log('📱 Sending pending tickets via server API...');
            const response = await axios.post(`${this.serverUrl}/api/send-pending-tickets`, {}, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.success) {
                console.log('✅ Pending tickets sent');
                console.log(`   📋 Processed: ${response.data.processed}`);
                console.log(`   ✅ Successful: ${response.data.successful}`);
                console.log(`   ❌ Failed: ${response.data.failed}`);
                
                this.processedCount += response.data.processed;
                this.successCount += response.data.successful;
                this.failureCount += response.data.failed;
                this.results = this.results.concat(response.data.results || []);
                
                return true;
            } else {
                throw new Error(response.data.message || 'Send pending tickets failed');
            }
        } catch (error) {
            console.error(`❌ Send pending tickets error: ${error.message}`);
            return false;
        }
    }

    /**
     * Process individual booking confirmation
     */
    async processIndividualBooking(bookingId) {
        try {
            console.log(`🔄 Confirming individual booking: ${bookingId}`);
            const response = await axios.post(`${this.serverUrl}/api/confirm-payment`, {
                bookingId: bookingId
            }, { 
                timeout: CONFIG.TIMEOUT 
            });
            
            if (response.data.success) {
                console.log(`✅ Booking ${bookingId} confirmed successfully`);
                console.log(`   🎫 Ticket ID: ${response.data.ticketId}`);
                console.log(`   📱 WhatsApp sent: ${response.data.whatsappResult?.success || false}`);
                
                this.successCount++;
                this.results.push({
                    bookingId: bookingId,
                    success: true,
                    ticketId: response.data.ticketId,
                    whatsappResult: response.data.whatsappResult
                });
                
                return true;
            } else {
                throw new Error(response.data.message || 'Booking confirmation failed');
            }
        } catch (error) {
            console.error(`❌ Error confirming booking ${bookingId}: ${error.message}`);
            this.failureCount++;
            this.results.push({
                bookingId: bookingId,
                success: false,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Process all pending bookings individually
     */
    async processAllPendingBookings() {
        console.log('🚀 Starting individual booking processing...\n');
        
        // Test connections
        if (!(await this.testServerConnection())) {
            return false;
        }
        
        if (!(await this.testGreenAPIConnection())) {
            console.log('⚠️ Green API not available, but continuing...');
        }

        // Get all bookings
        const allBookings = await this.getAllBookings();
        if (allBookings.length === 0) {
            console.log('❌ No bookings found');
            return false;
        }

        // Find pending bookings
        const pendingBookings = this.findPendingBookings(allBookings);
        
        if (pendingBookings.length === 0) {
            console.log('✅ No pending bookings found');
            return true;
        }

        console.log(`📋 Found ${pendingBookings.length} pending bookings to process\n`);

        // Process each booking individually
        for (const booking of pendingBookings) {
            console.log(`\n🔄 Processing booking: ${booking.booking_string_id || booking.id}`);
            console.log(`   👤 ${booking.first_name} ${booking.last_name}`);
            console.log(`   📞 ${booking.user_phone || booking.phone}`);
            console.log(`   🪑 Table ${booking.table_number || booking.table}, Seat ${booking.seat_number || booking.seat}`);
            
            await this.processIndividualBooking(booking.booking_string_id || booking.id);
            this.processedCount++;
            
            // Delay between requests
            if (this.processedCount < pendingBookings.length) {
                console.log(`⏳ Waiting ${CONFIG.DELAY_BETWEEN_REQUESTS}ms before next booking...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_REQUESTS));
            }
        }

        // Print summary
        this.printSummary();
        return true;
    }

    /**
     * Print processing summary
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 PROCESSING SUMMARY');
        console.log('='.repeat(60));
        console.log(`🌐 Server: ${this.serverUrl}`);
        console.log(`📋 Total processed: ${this.processedCount}`);
        console.log(`✅ Successful: ${this.successCount}`);
        console.log(`❌ Failed: ${this.failureCount}`);
        console.log(`📱 WhatsApp messages sent: ${this.successCount}`);
        
        if (this.results.length > 0) {
            console.log('\n📋 DETAILED RESULTS:');
            console.log('-'.repeat(60));
            
            this.results.forEach((result, index) => {
                const status = result.success ? '✅' : '❌';
                console.log(`${index + 1}. ${status} ${result.bookingId}`);
                if (result.success) {
                    console.log(`   🎫 Ticket: ${result.ticketId || 'N/A'}`);
                    if (result.whatsappResult) {
                        console.log(`   📱 WhatsApp: ${result.whatsappResult.success ? 'Sent' : 'Failed'}`);
                    }
                } else {
                    console.log(`   ❌ Error: ${result.error}`);
                }
            });
        }
        
        console.log('\n🎯 Processing completed!');
    }
}

// Main execution
async function main() {
    console.log('🎫 Auto Confirm Bookings Script');
    console.log('================================\n');
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    const serverUrlArg = args.find(arg => arg.startsWith('--server-url='));
    const serverUrl = serverUrlArg ? serverUrlArg.split('=')[1] : null;
    
    // Determine server URL
    let finalServerUrl = serverUrl;
    if (!finalServerUrl) {
        // Try local first, then production
        console.log('🔍 No server URL specified, trying local first...');
        const localTest = new AutoConfirmBookings(CONFIG.LOCAL_SERVER_URL);
        if (await localTest.testServerConnection()) {
            finalServerUrl = CONFIG.LOCAL_SERVER_URL;
            console.log('✅ Using local server');
        } else {
            finalServerUrl = CONFIG.DEFAULT_SERVER_URL;
            console.log('✅ Using production server');
        }
    }
    
    const processor = new AutoConfirmBookings(finalServerUrl);
    
    try {
        // Try bulk confirmation first
        console.log('🔄 Attempting bulk confirmation...');
        if (await processor.processBulkConfirmation()) {
            processor.printSummary();
            process.exit(0);
        }
        
        // If bulk fails, try individual processing
        console.log('\n🔄 Bulk confirmation failed, trying individual processing...');
        await processor.processAllPendingBookings();
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = AutoConfirmBookings;
