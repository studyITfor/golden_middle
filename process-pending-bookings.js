#!/usr/bin/env node

/**
 * Process Pending Bookings Script
 * 
 * This script automatically processes all bookings with "Ожидает подтверждения" status
 * and sends WhatsApp tickets via Green API.
 * 
 * Usage: node process-pending-bookings.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const CONFIG = {
    BOOKINGS_FILE: path.join(__dirname, 'backend', 'bookings.json'),
    GREEN_API_BASE: 'https://7105.api.greenapi.com',
    GREEN_ID_INSTANCE: '7105317460',
    GREEN_API_TOKEN: '76de4f547a564df4a3092b41aeacfd7ad0e848b3506d42a1b9',
    PUBLIC_BASE_URL: 'https://upbeat-compassion-production.up.railway.app',
    DELAY_BETWEEN_SENDS: 2000, // 2 seconds delay between WhatsApp sends
    MAX_RETRIES: 3
};

// Status constants
const STATUS = {
    PENDING: 'Ожидает подтверждения',
    PAID: 'Забронировано (оплачено)',
    CONFIRMED: 'Оплачен'
};

class PendingBookingsProcessor {
    constructor() {
        this.bookings = {};
        this.processedCount = 0;
        this.successCount = 0;
        this.failureCount = 0;
        this.results = [];
    }

    /**
     * Load bookings from JSON file
     */
    loadBookings() {
        try {
            if (!fs.existsSync(CONFIG.BOOKINGS_FILE)) {
                console.error('❌ Bookings file not found:', CONFIG.BOOKINGS_FILE);
                return false;
            }

            const data = fs.readFileSync(CONFIG.BOOKINGS_FILE, 'utf8');
            this.bookings = JSON.parse(data);
            console.log(`📋 Loaded ${Object.keys(this.bookings).length} bookings from file`);
            return true;
        } catch (error) {
            console.error('❌ Error loading bookings:', error.message);
            return false;
        }
    }

    /**
     * Save bookings back to JSON file
     */
    saveBookings() {
        try {
            fs.writeFileSync(CONFIG.BOOKINGS_FILE, JSON.stringify(this.bookings, null, 4), 'utf8');
            console.log('💾 Bookings saved to file');
            return true;
        } catch (error) {
            console.error('❌ Error saving bookings:', error.message);
            return false;
        }
    }

    /**
     * Generate ticket ID
     */
    generateTicketId() {
        return 'T' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 5).toUpperCase();
    }

    /**
     * Send WhatsApp message via Green API
     */
    async sendWhatsAppMessage(phone, message, fileUrl = null, fileName = null) {
        const cleanPhone = phone.replace(/[^\d]/g, '');
        const chatId = cleanPhone + '@c.us';
        
        try {
            let response;
            
            if (fileUrl && fileName) {
                // Send file
                const payload = {
                    chatId: chatId,
                    urlFile: fileUrl,
                    fileName: fileName,
                    caption: message
                };
                
                response = await axios.post(
                    `${CONFIG.GREEN_API_BASE}/waInstance${CONFIG.GREEN_ID_INSTANCE}/sendFileByUrl/${CONFIG.GREEN_API_TOKEN}`,
                    payload,
                    { timeout: 15000 }
                );
            } else {
                // Send text message
                const payload = {
                    chatId: chatId,
                    message: message
                };
                
                response = await axios.post(
                    `${CONFIG.GREEN_API_BASE}/waInstance${CONFIG.GREEN_ID_INSTANCE}/sendMessage/${CONFIG.GREEN_API_TOKEN}`,
                    payload,
                    { timeout: 15000 }
                );
            }
            
            return {
                success: true,
                messageId: response.data?.idMessage,
                response: response.data
            };
        } catch (error) {
            console.error(`❌ WhatsApp send error for ${phone}:`, error.message);
            return {
                success: false,
                error: error.message,
                details: error.response?.data
            };
        }
    }

    /**
     * Generate ticket content
     */
    generateTicketContent(booking) {
        const ticketId = this.generateTicketId();
        const bookingDate = new Date(booking.bookingDate).toLocaleDateString('ru-RU');
        const currentDate = new Date().toLocaleDateString('ru-RU');
        
        return {
            ticketId: ticketId,
            content: `🎫 БИЛЕТ ПОДТВЕРЖДЕН 🎫

ID билета: ${ticketId}
ID бронирования: ${booking.id}

👤 Студент: ${booking.firstName} ${booking.lastName}
📞 Телефон: ${booking.phone}
📧 Email: ${booking.email || 'Не указан'}

🪑 Место: Стол ${booking.table}, Место ${booking.seat}
💰 Стоимость: ${booking.price} сом
📅 Дата бронирования: ${bookingDate}
✅ Статус: ЗАБРОНИРОВАНО (ОПЛАЧЕНО)

📱 Билет отправлен: ${currentDate}
🎓 Спасибо за бронирование!

Этот билет действителен для входа на мероприятие.
Пожалуйста, предъявите этот билет на входе.`
        };
    }

    /**
     * Process a single booking
     */
    async processBooking(bookingId, booking) {
        console.log(`\n🔄 Processing booking: ${bookingId}`);
        console.log(`   👤 ${booking.firstName} ${booking.lastName}`);
        console.log(`   📞 ${booking.phone}`);
        console.log(`   🪑 Table ${booking.table}, Seat ${booking.seat}`);
        console.log(`   💰 ${booking.price} сом`);

        try {
            // Generate ticket content
            const ticket = this.generateTicketContent(booking);
            
            // Send WhatsApp message with ticket
            const whatsappResult = await this.sendWhatsAppMessage(
                booking.phone,
                ticket.content
            );

            if (whatsappResult.success) {
                // Update booking status
                booking.status = STATUS.PAID;
                booking.paymentDate = new Date().toISOString();
                booking.paymentConfirmedBy = 'auto-processor';
                booking.ticketId = ticket.ticketId;
                booking.whatsappMessageId = whatsappResult.messageId;
                booking.whatsappSent = true;
                booking.whatsappSentDate = new Date().toISOString();

                this.bookings[bookingId] = booking;
                this.successCount++;

                console.log(`✅ Successfully processed booking ${bookingId}`);
                console.log(`   🎫 Ticket ID: ${ticket.ticketId}`);
                console.log(`   📱 WhatsApp Message ID: ${whatsappResult.messageId}`);

                this.results.push({
                    bookingId: bookingId,
                    success: true,
                    ticketId: ticket.ticketId,
                    whatsappMessageId: whatsappResult.messageId,
                    phone: booking.phone,
                    name: `${booking.firstName} ${booking.lastName}`
                });
            } else {
                // Mark as failed
                booking.status = 'confirmation_failed';
                booking.confirmationError = whatsappResult.error;
                booking.failedDate = new Date().toISOString();

                this.bookings[bookingId] = booking;
                this.failureCount++;

                console.log(`❌ Failed to process booking ${bookingId}: ${whatsappResult.error}`);

                this.results.push({
                    bookingId: bookingId,
                    success: false,
                    error: whatsappResult.error,
                    phone: booking.phone,
                    name: `${booking.firstName} ${booking.lastName}`
                });
            }

        } catch (error) {
            console.error(`❌ Error processing booking ${bookingId}:`, error.message);
            
            // Mark as failed
            booking.status = 'confirmation_failed';
            booking.confirmationError = error.message;
            booking.failedDate = new Date().toISOString();

            this.bookings[bookingId] = booking;
            this.failureCount++;

            this.results.push({
                bookingId: bookingId,
                success: false,
                error: error.message,
                phone: booking.phone,
                name: `${booking.firstName} ${booking.lastName}`
            });
        }

        this.processedCount++;
    }

    /**
     * Find all pending bookings
     */
    findPendingBookings() {
        const pendingBookings = [];
        
        for (const [bookingId, booking] of Object.entries(this.bookings)) {
            if (booking.status === STATUS.PENDING || 
                booking.status === 'Ожидает подтверждения' ||
                booking.status === ' ' || // Garbled text
                (booking.status && booking.status.includes('подтверждения'))) {
                
                // Validate required fields
                if (booking.phone && booking.firstName && booking.lastName) {
                    pendingBookings.push({ bookingId, booking });
                } else {
                    console.warn(`⚠️ Skipping booking ${bookingId} - missing required fields`);
                }
            }
        }
        
        return pendingBookings;
    }

    /**
     * Process all pending bookings
     */
    async processAllPendingBookings() {
        console.log('🚀 Starting pending bookings processing...\n');
        
        // Load bookings
        if (!this.loadBookings()) {
            return false;
        }

        // Find pending bookings
        const pendingBookings = this.findPendingBookings();
        
        if (pendingBookings.length === 0) {
            console.log('✅ No pending bookings found');
            return true;
        }

        console.log(`📋 Found ${pendingBookings.length} pending bookings to process\n`);

        // Process each booking
        for (const { bookingId, booking } of pendingBookings) {
            await this.processBooking(bookingId, booking);
            
            // Delay between processing to avoid rate limiting
            if (this.processedCount < pendingBookings.length) {
                console.log(`⏳ Waiting ${CONFIG.DELAY_BETWEEN_SENDS}ms before next booking...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_SENDS));
            }
        }

        // Save updated bookings
        this.saveBookings();

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
        console.log(`📋 Total processed: ${this.processedCount}`);
        console.log(`✅ Successful: ${this.successCount}`);
        console.log(`❌ Failed: ${this.failureCount}`);
        console.log(`📱 WhatsApp messages sent: ${this.successCount}`);
        
        if (this.results.length > 0) {
            console.log('\n📋 DETAILED RESULTS:');
            console.log('-'.repeat(60));
            
            this.results.forEach((result, index) => {
                const status = result.success ? '✅' : '❌';
                console.log(`${index + 1}. ${status} ${result.bookingId} - ${result.name} (${result.phone})`);
                if (result.success) {
                    console.log(`   🎫 Ticket: ${result.ticketId}`);
                    console.log(`   📱 WhatsApp: ${result.whatsappMessageId}`);
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
    console.log('🎫 Pending Bookings Processor');
    console.log('=============================\n');
    
    const processor = new PendingBookingsProcessor();
    
    try {
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

module.exports = PendingBookingsProcessor;
