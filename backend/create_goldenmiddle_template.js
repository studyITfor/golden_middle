#!/usr/bin/env node

/**
 * Create GoldenMiddle ticket template with exact positioning
 * This creates a professional PDF template matching the visual design
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createGoldenMiddleTemplate() {
    try {
        console.log('🎫 Creating GoldenMiddle ticket template...');
        
        // Create a new PDF document with exact dimensions (460.8 x 250.08)
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([460.8, 250.08]); // Exact template dimensions
        
        const { width, height } = page.getSize();
        console.log('📐 Template dimensions:', { width, height });
        
        // Embed fonts
        const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const largeFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        
        // Background - Golden gradient effect
        page.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: height,
            color: rgb(1, 0.95, 0.8) // Light gold background
        });
        
        // Main border
        page.drawRectangle({
            x: 15,
            y: 15,
            width: width - 30,
            height: height - 30,
            borderColor: rgb(0.8, 0.6, 0.2), // Golden border
            borderWidth: 3
        });
        
        // Inner decorative border
        page.drawRectangle({
            x: 25,
            y: 25,
            width: width - 50,
            height: height - 50,
            borderColor: rgb(0.6, 0.4, 0.1), // Darker gold
            borderWidth: 1
        });
        
        // Top decorative elements
        // Left corner decoration
        page.drawCircle({
            x: 30,
            y: height - 40,
            size: 8,
            borderColor: rgb(0.8, 0.6, 0.2),
            borderWidth: 2
        });
        
        // Right corner decoration
        page.drawCircle({
            x: width - 30,
            y: height - 40,
            size: 8,
            borderColor: rgb(0.8, 0.6, 0.2),
            borderWidth: 2
        });
        
        // Main title - GOLDENMIDDLE
        page.drawText('GOLDENMIDDLE', {
            x: width / 2 - 80, // Center horizontally
            y: height - 60,
            size: 20,
            font: titleFont,
            color: rgb(0.6, 0.4, 0.1) // Dark gold
        });
        
        // Event details
        page.drawText('26 OCTOBER 2025', {
            x: width / 2 - 60,
            y: height - 85,
            size: 12,
            font: regularFont,
            color: rgb(0.4, 0.4, 0.4)
        });
        
        page.drawText('18:00 • ASMAN', {
            x: width / 2 - 50,
            y: height - 105,
            size: 12,
            font: regularFont,
            color: rgb(0.4, 0.4, 0.4)
        });
        
        // Decorative line
        page.drawLine({
            start: { x: 50, y: height - 125 },
            end: { x: width - 50, y: height - 125 },
            thickness: 1,
            color: rgb(0.8, 0.6, 0.2)
        });
        
        // Name placeholder - CENTER of ticket (exact position for "ИМЯ И ФАМИЛИЯ")
        page.drawText('FULL NAME', {
            x: width / 2 - 40, // Center horizontally
            y: height / 2 + 10, // Center vertically
            size: 16,
            font: largeFont,
            color: rgb(0.2, 0.2, 0.2) // Dark text for visibility
        });
        
        // Table and seat placeholder - RIGHT LOWER CORNER (exact position for "НОМЕР СТОЛА И МЕСТО")
        page.drawText('TABLE AND SEAT', {
            x: width - 150, // Right side
            y: 60, // Lower area
            size: 12,
            font: regularFont,
            color: rgb(0.3, 0.3, 0.3)
        });
        
        // QR code placeholder - LEFT LOWER CORNER (exact position for QR code)
        page.drawRectangle({
            x: 30, // Left side
            y: 30, // Lower area
            width: 60,
            height: 60,
            borderColor: rgb(0.6, 0.4, 0.1),
            borderWidth: 2
        });
        
        page.drawText('QR', {
            x: 50, // Center in QR box
            y: 55, // Center in QR box
            size: 14,
            font: regularFont,
            color: rgb(0.5, 0.5, 0.5)
        });
        
        // Ticket ID placeholder
        page.drawText('ID: TICKET_ID', {
            x: 30,
            y: 20,
            size: 8,
            font: regularFont,
            color: rgb(0.4, 0.4, 0.4)
        });
        
        // Bottom decorative elements
        // Left corner
        page.drawCircle({
            x: 30,
            y: 30,
            size: 6,
            borderColor: rgb(0.8, 0.6, 0.2),
            borderWidth: 1
        });
        
        // Right corner
        page.drawCircle({
            x: width - 30,
            y: 30,
            size: 6,
            borderColor: rgb(0.8, 0.6, 0.2),
            borderWidth: 1
        });
        
        // Price information
        page.drawText('5500 SOM', {
            x: width - 100,
            y: height - 140,
            size: 14,
            font: titleFont,
            color: rgb(0.6, 0.4, 0.1)
        });
        
        // Organization
        page.drawText('KGMA', {
            x: 50,
            y: height - 140,
            size: 12,
            font: regularFont,
            color: rgb(0.4, 0.4, 0.4)
        });
        
        // Save the template
        const pdfBytes = await pdfDoc.save();
        const templatePath = path.join(__dirname, 'example.pdf');
        
        fs.writeFileSync(templatePath, pdfBytes);
        
        console.log('✅ GoldenMiddle template created successfully!');
        console.log('📁 Template saved to:', templatePath);
        console.log('📊 File size:', (pdfBytes.length / 1024).toFixed(2), 'KB');
        
        // Also create a PNG version for reference
        const pngPath = path.join(__dirname, 'example.png');
        console.log('📝 Note: PNG version would need to be created separately');
        
        return templatePath;
        
    } catch (error) {
        console.error('❌ Error creating template:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    createGoldenMiddleTemplate();
}

module.exports = { createGoldenMiddleTemplate };
