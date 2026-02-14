#!/usr/bin/env node

/**
 * Ticket Generation Script
 * 
 * Generates personalized PDF tickets using a template and client data
 * Supports both PDF and PNG templates
 * Usage: node generate_ticket.js -Template template.pdf -Output output.pdf -Name "John" -Surname "Doe" -Table "5" -Seat "10" -Date "26 октября 2025" -Time "18:00" -Place "Асман" -Price "5500 Сом" -TicketId "TICKET123"
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const yargs = require('yargs');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};

// Simple argument parser
for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^-/, '');
    const value = args[i + 1];
    options[key] = value;
}

// Validate required arguments
const requiredArgs = ['Template', 'Output', 'Name', 'Surname', 'Table', 'Seat', 'Date', 'Time', 'Place', 'Price', 'TicketId'];
const missingArgs = requiredArgs.filter(arg => !options[arg]);

if (missingArgs.length > 0) {
    console.error('❌ Missing required arguments:', missingArgs.join(', '));
    console.error('Usage: node generate_ticket.js -Template template.pdf -Output output.pdf -Name "John" -Surname "Doe" -Table "5" -Seat "10" -Date "26 октября 2025" -Time "18:00" -Place "Асман" -Price "5500 Сом" -TicketId "TICKET123"');
    process.exit(1);
}

async function generateTicket() {
    try {
        console.log('🎫 Starting ticket generation...');
        console.log('📋 Ticket details:', {
            name: options.Name,
            surname: options.Surname,
            table: options.Table,
            seat: options.Seat,
            date: options.Date,
            time: options.Time,
            place: options.Place,
            price: options.Price,
            ticketId: options.TicketId
        });

        // Check if template file exists
        if (!fs.existsSync(options.Template)) {
            console.error('❌ Template file not found:', options.Template);
            process.exit(1);
        }

        // Determine template type
        const templateExt = path.extname(options.Template).toLowerCase();
        const isPngTemplate = templateExt === '.png';
        
        console.log(`📄 Loading template ${isPngTemplate ? 'PNG' : 'PDF'}...`);
        
        let pdfDoc;
        let firstPage;
        let width, height;
        
        if (isPngTemplate) {
            // Create new PDF document for PNG template
            pdfDoc = await PDFDocument.create();
            const templateBytes = fs.readFileSync(options.Template);
            const pngImage = await pdfDoc.embedPng(templateBytes);
            
            // Create page with PNG dimensions
            const { width: imgWidth, height: imgHeight } = pngImage;
            firstPage = pdfDoc.addPage([imgWidth, imgHeight]);
            width = imgWidth;
            height = imgHeight;
            
            // Draw PNG as background
            firstPage.drawImage(pngImage, {
                x: 0,
                y: 0,
                width: imgWidth,
                height: imgHeight
            });
        } else {
            // Load existing PDF template
            const templateBytes = fs.readFileSync(options.Template);
            pdfDoc = await PDFDocument.load(templateBytes);
            const pages = pdfDoc.getPages();
            
            if (pages.length === 0) {
                console.error('❌ Template PDF has no pages');
                process.exit(1);
            }
            
            firstPage = pages[0];
            const size = firstPage.getSize();
            width = size.width;
            height = size.height;
        }
        
        console.log('📐 Page dimensions:', { width, height });

        // Embed fonts
        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

        // Generate the exact Russian text format
        console.log('✏️ Adding personalized data...');
        
        const ticketText = `Hello, ${options.Name}!

Your golden ticket for GOLDENMIDDLE is ready!

Date: ${options.Date}
Time: ${options.Time}
Place: ${options.Place}
Your seat: Table ${options.Table}, Seat ${options.Seat}
Price: ${options.Price}
Ticket ID: ${options.TicketId}

Ticket is attached. Please show it at the event entrance!

Welcome to GOLDENMIDDLE!`;

        // Draw the main ticket text
        firstPage.drawText(ticketText, {
            x: 50,
            y: height - 50,
            size: 12,
            font: regularFont,
            color: rgb(0, 0, 0),
            lineHeight: 16
        });

        // Generate QR code
        console.log('🔲 Generating QR code...');
        const qrDataUrl = await QRCode.toDataURL(options.TicketId, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        
        // Convert data URL to image bytes
        const qrImageBytes = Buffer.from(qrDataUrl.split(',')[1], 'base64');
        const qrImage = await pdfDoc.embedPng(qrImageBytes);
        
        // Draw QR code (bottom right area)
        const qrSize = 100;
        firstPage.drawImage(qrImage, {
            x: width - qrSize - 30,
            y: 30,
            width: qrSize,
            height: qrSize
        });

        // Add ticket ID text near QR code
        firstPage.drawText(options.TicketId, {
            x: width - qrSize - 30,
            y: 20,
            size: 10,
            font: regularFont,
            color: rgb(0, 0, 0)
        });

        // Save the PDF
        console.log('💾 Saving PDF...');
        const pdfBytes = await pdfDoc.save();
        
        // Ensure output directory exists
        const outputDir = path.dirname(options.Output);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(options.Output, pdfBytes);
        
        console.log('✅ Ticket generated successfully!');
        console.log('📁 Output file:', options.Output);
        console.log('📊 File size:', (pdfBytes.length / 1024).toFixed(2), 'KB');
        
        return {
            success: true,
            outputPath: options.Output,
            fileSize: pdfBytes.length
        };

    } catch (error) {
        console.error('❌ Error generating ticket:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    generateTicket();
}

module.exports = { generateTicket };
