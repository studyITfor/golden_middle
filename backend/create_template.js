#!/usr/bin/env node

/**
 * Create a sample ticket template
 * This creates a basic PDF template that can be used for ticket generation
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function createTemplate() {
    try {
        console.log('🎫 Creating ticket template...');
        
        // Create a new PDF document
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([400, 600]); // A6 size (4x6 inches)
        
        const { width, height } = page.getSize();
        
        // Embed fonts
        const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // Background color (light gold)
        page.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: height,
            color: rgb(1, 0.95, 0.8) // Light gold
        });
        
        // Border
        page.drawRectangle({
            x: 10,
            y: 10,
            width: width - 20,
            height: height - 20,
            borderColor: rgb(0, 0, 0),
            borderWidth: 2
        });
        
        // Title
        page.drawText('GOLDENMIDDLE', {
            x: 50,
            y: height - 80,
            size: 24,
            font: titleFont,
            color: rgb(0, 0, 0)
        });
        
        // Event details
        page.drawText('Date: 26 October', {
            x: 50,
            y: height - 120,
            size: 14,
            font: regularFont,
            color: rgb(0, 0, 0)
        });
        
        page.drawText('Time: 18:00', {
            x: 50,
            y: height - 140,
            size: 14,
            font: regularFont,
            color: rgb(0, 0, 0)
        });
        
        page.drawText('Place: Asman', {
            x: 50,
            y: height - 160,
            size: 14,
            font: regularFont,
            color: rgb(0, 0, 0)
        });
        
        // Name placeholder
        page.drawLine({
            start: { x: 50, y: height - 200 },
            end: { x: width - 50, y: height - 200 },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        page.drawText('Name and Surname', {
            x: 50,
            y: height - 220,
            size: 12,
            font: regularFont,
            color: rgb(0.5, 0.5, 0.5)
        });
        
        page.drawLine({
            start: { x: 50, y: height - 240 },
            end: { x: width - 50, y: height - 240 },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        
        // Table and seat placeholder
        page.drawText('Table and Seat Number', {
            x: 50,
            y: height - 280,
            size: 12,
            font: regularFont,
            color: rgb(0.5, 0.5, 0.5)
        });
        
        // QR code placeholder
        page.drawRectangle({
            x: width - 100,
            y: 50,
            width: 80,
            height: 80,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        page.drawText('QR', {
            x: width - 70,
            y: 90,
            size: 12,
            font: regularFont,
            color: rgb(0.5, 0.5, 0.5)
        });
        
        // Decorative elements
        // Top corners
        page.drawCircle({
            x: 20,
            y: height - 30,
            size: 5,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        page.drawCircle({
            x: width - 20,
            y: height - 30,
            size: 5,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        // Bottom corners
        page.drawCircle({
            x: 20,
            y: 20,
            size: 5,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        page.drawCircle({
            x: width - 20,
            y: 20,
            size: 5,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1
        });
        
        // Save the template
        const pdfBytes = await pdfDoc.save();
        const templatePath = path.join(__dirname, 'ticket_template.pdf');
        
        fs.writeFileSync(templatePath, pdfBytes);
        
        console.log('✅ Template created successfully!');
        console.log('📁 Template saved to:', templatePath);
        console.log('📊 File size:', (pdfBytes.length / 1024).toFixed(2), 'KB');
        
        return templatePath;
        
    } catch (error) {
        console.error('❌ Error creating template:', error.message);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    createTemplate();
}

module.exports = { createTemplate };
