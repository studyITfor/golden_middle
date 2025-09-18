// Enhanced ticket generation utilities for GoldenMiddle - FIXED VERSION
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const { createClient } = require('@supabase/supabase-js');

const config = require('./config');

const GREEN_API_URL = process.env.GREEN_API_URL || config.whatsapp.apiUrl;
const ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE || config.whatsapp.id;
const TOKEN = process.env.GREEN_API_TOKEN || config.whatsapp.token;

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✅ Supabase client initialized for ticket storage');
} else {
  console.log('⚠️ Supabase credentials not found, using Railway public storage fallback');
}

// Generate a unique ticket ID
function generateTicketId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TM${timestamp}${random}`;
}

// Extract and normalize booking data
function extractBookingData(booking) {
  const firstName = booking.first_name || booking.firstName || 'Guest';
  const lastName = booking.last_name || booking.lastName || '';
  const fullName = lastName ? `${firstName} ${lastName}`.trim() : firstName;
  const table = booking.table_number || booking.table || 'N/A';
  const seat = booking.seat_number || booking.seat || 'N/A';
  const ticketId = booking.ticket_id || booking.ticketId || generateTicketId();
  const phone = booking.user_phone || booking.phone || 'N/A';

  return {
    firstName,
    lastName,
    fullName,
    table,
    seat,
    ticketId,
    phone
  };
}

// Generate ticket using PDF/PNG template with real booking data
async function generateTicketFromTemplate(booking, templatePath, outputPath) {
  try {
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    // Extract real booking data
    const data = extractBookingData(booking);
    console.log('📋 Using real booking data:', { 
      fullName: data.fullName, 
      table: data.table, 
      seat: data.seat, 
      ticketId: data.ticketId 
    });

    // Determine template type
    const templateExt = path.extname(templatePath).toLowerCase();
    const isPngTemplate = templateExt === '.png';
    
    let pdfDoc;
    let firstPage;
    let width, height;
    
    if (isPngTemplate) {
      // Create new PDF document for PNG template
      pdfDoc = await PDFDocument.create();
      const templateBytes = fs.readFileSync(templatePath);
      const pngImage = await pdfDoc.embedPng(templateBytes);
      
      const { width: imgWidth, height: imgHeight } = pngImage;
      firstPage = pdfDoc.addPage([imgWidth, imgHeight]);
      width = imgWidth;
      height = imgHeight;
      
      firstPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: imgWidth,
        height: imgHeight
      });
    } else {
      // Load existing PDF template
      const templateBytes = fs.readFileSync(templatePath);
      pdfDoc = await PDFDocument.load(templateBytes);
      const pages = pdfDoc.getPages();
      
      if (pages.length === 0) {
        throw new Error('Template PDF has no pages');
      }
      
      firstPage = pages[0];
      const size = firstPage.getSize();
      width = size.width;
      height = size.height;
    }

    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Generate English text for PDF compatibility
    const ticketText = `Hello, ${data.fullName}!

Your golden ticket for GOLDENMIDDLE is ready!

Date: 26 October 2025
Time: 18:00
Place: Asman
Your seat: Table ${data.table}, Seat ${data.seat}
Price: 5500 Som
Ticket ID: ${data.ticketId}

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

    // Generate QR code with real ticket ID
    const qrDataUrl = await QRCode.toDataURL(data.ticketId, {
      width: 200,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    
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
    firstPage.drawText(data.ticketId, {
      x: width - qrSize - 30,
      y: 20,
      size: 10,
      font: regularFont,
      color: rgb(0, 0, 0)
    });

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, pdfBytes);
    
    console.log('✅ Ticket generated successfully with real data!');
    console.log('📁 Output file:', outputPath);
    console.log('📊 File size:', (pdfBytes.length / 1024).toFixed(2), 'KB');
    
    return {
      success: true,
      outputPath: outputPath,
      fileSize: pdfBytes.length,
      ticketId: data.ticketId,
      fullName: data.fullName
    };

  } catch (error) {
    console.error('❌ Error generating ticket from template:', error);
    throw error;
  }
}

// Generate ticket for booking with template support
async function generateTicketForBooking(booking) {
  // Extract and normalize booking data
  const data = extractBookingData(booking);
  
  // Always generate a ticket ID if missing
  const ticketId = data.ticketId;
  const pdfFilename = `${ticketId}.pdf`;
  const ticketsDir = path.join(__dirname, '..', 'tickets');
  const pdfFilepath = path.join(ticketsDir, pdfFilename);

  // Ensure tickets directory exists
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
  }

  // Try to find template files
  const templatePdf = path.join(__dirname, 'ticket_design.pdf');
  const templatePng = path.join(__dirname, 'ticket_design.png');
  const fallbackTemplate = path.join(__dirname, 'ticket_template.pdf');

  let templatePath = null;
  if (fs.existsSync(templatePdf)) {
    templatePath = templatePdf;
    console.log('✅ Using PDF template:', templatePdf);
  } else if (fs.existsSync(templatePng)) {
    templatePath = templatePng;
    console.log('✅ Using PNG template:', templatePng);
  } else if (fs.existsSync(fallbackTemplate)) {
    templatePath = fallbackTemplate;
    console.log('✅ Using fallback template:', fallbackTemplate);
  } else {
    // Create a basic template
    console.log('⚠️ No template found, creating basic template...');
    await createBasicTemplate(fallbackTemplate);
    templatePath = fallbackTemplate;
  }

  try {
    // Generate ticket using template
    await generateTicketFromTemplate(booking, templatePath, pdfFilepath);
    
    return {
      ticketId,
      path: `/tickets/${pdfFilename}`,
      localPath: pdfFilepath,
      isTemp: false,
      fullName: data.fullName,
      table: data.table,
      seat: data.seat
    };
  } catch (error) {
    console.error('❌ Error generating ticket from template:', error);
    // Fallback to text file
    return generateTextTicket(booking, ticketId);
  }
}

// Create a basic template if none exists
async function createBasicTemplate(templatePath) {
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 600]);
    const { width, height } = page.getSize();

    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Background (golden look)
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(1, 0.84, 0)
    });

    // Border
    page.drawRectangle({
      x: 20,
      y: 20,
      width: width - 40,
      height: height - 40,
      borderColor: rgb(0.8, 0.6, 0),
      borderWidth: 5,
      color: rgb(1, 1, 1)
    });

    // Title
    page.drawText('GOLDENMIDDLE TICKET', {
      x: 50,
      y: height - 80,
      size: 24,
      font: titleFont,
      color: rgb(0, 0, 0)
    });
    
    // Event details
    page.drawText('Date: 26 October 2025', {
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
    
    page.drawText('Name: [WILL BE FILLED]', {
      x: 50,
      y: height - 220,
      size: 12,
      font: regularFont,
      color: rgb(0, 0, 0)
    });
    
    page.drawText('Table: [WILL BE FILLED]', {
      x: 50,
      y: height - 240,
      size: 12,
      font: regularFont,
      color: rgb(0, 0, 0)
    });
    
    page.drawText('Seat: [WILL BE FILLED]', {
      x: 50,
      y: height - 260,
      size: 12,
      font: regularFont,
      color: rgb(0, 0, 0)
    });
    
    page.drawText('Ticket ID: [WILL BE FILLED]', {
      x: 50,
      y: height - 280,
      size: 12,
      font: regularFont,
      color: rgb(0, 0, 0)
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(templatePath, pdfBytes);
    console.log('✅ Basic template created:', templatePath);
  } catch (error) {
    console.error('❌ Error creating basic template:', error);
    throw error;
  }
}

// Generate text ticket as fallback
function generateTextTicket(booking, ticketId) {
  const data = extractBookingData(booking);
  const txtFilename = `${ticketId}.txt`;
  const txtFilepath = path.join(__dirname, '..', 'tickets', txtFilename);
  const contentLines = [
    `🎫 TICKET CONFIRMED 🎫`,
    ``,
    `Ticket ID: ${ticketId}`,
    `Booking ID: ${booking.booking_string_id || booking.id}`,
    `Name: ${data.fullName}`,
    `Phone: ${data.phone}`,
    `Table: ${data.table}`,
    `Seat: ${data.seat}`,
    `Date: ${booking.created_at}`,
    `Status: ✅ CONFIRMED & PAID`,
    ``,
    `This ticket is valid for entry to the event.`,
    `Please present this ticket at the entrance.`,
    ``,
    `Thank you for your booking! 🎓`
  ];
  
  const ticketsDir = path.dirname(txtFilepath);
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
  }
  
  fs.writeFileSync(txtFilepath, contentLines.join('\n'), 'utf8');
  return { 
    ticketId, 
    path: `/tickets/${txtFilename}`, 
    localPath: txtFilepath, 
    isTemp: false,
    fullName: data.fullName,
    table: data.table,
    seat: data.seat
  };
}

// Upload file to Supabase storage
async function uploadFileToSupabase(localPath, destKey) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  
  try {
    const file = fs.createReadStream(localPath);
    const { data, error } = await supabase.storage
      .from('tickets')
      .upload(destKey, file, { upsert: true });
    
    if (error) {
      throw error;
    }
    
    const { data: publicData } = supabase.storage
      .from('tickets')
      .getPublicUrl(destKey);
    
    return publicData.publicUrl;
  } catch (error) {
    console.error('❌ Error uploading to Supabase:', error);
    throw error;
  }
}

// Get public URL for ticket (Railway fallback)
function getPublicTicketUrl(ticketPath, ticketId) {
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'https://upbeat-compassion-production.up.railway.app';
  return `${baseUrl}${ticketPath}`;
}

// Send WhatsApp message with Russian text and PDF
async function sendWhatsAppTicket(phone, ticket) {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const chatId = cleanPhone + '@c.us';
  
  console.log('📱 Sending WhatsApp ticket to:', phone, 'chatId:', chatId);
  
  try {
    // First send the Russian text message with emojis
    const russianMessage = `🎫 Здравствуйте, ${ticket.firstName || 'Guest'}!

🎉 Ваш золотой билет на GOLDENMIDDLE готов!

📅 Дата: 26 октября 2025
⏰ Время: 18:00
📍 Место: Асман
🪑 Ваше место: Стол ${ticket.table || 'N/A'}, Место ${ticket.seat || 'N/A'}
💵 Цена: 5500 Сом
🆔 ID билета: ${ticket.ticketId || 'N/A'}

📎 Билет во вложении. Покажите его при входе на мероприятие!

🎊 Добро пожаловать на GOLDENMIDDLE!`;

    const textPayload = {
      chatId: chatId,
      message: russianMessage
    };
    
    const textResponse = await axios.post(
      `${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendMessage/${TOKEN}`,
      textPayload,
      { timeout: 15000 }
    );
    
    console.log('✅ Russian text message sent successfully:', textResponse.data);
    
    // Then send the PDF file if available
    if (ticket.pdfUrl) {
      console.log('📄 Sending PDF ticket...');
      const pdfPayload = {
        chatId: chatId,
        urlFile: ticket.pdfUrl,
        fileName: `ticket_${ticket.ticketId}.pdf`,
        caption: '🎫 Ваш билет (PDF документ)'
      };
      
      const pdfResponse = await axios.post(
        `${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendFileByUrl/${TOKEN}`,
        pdfPayload,
        { timeout: 15000 }
      );
      
      console.log('✅ PDF sent successfully:', pdfResponse.data);
      
      return {
        success: true,
        message: 'Ticket sent successfully via Green API',
        provider: 'Green API',
        textMessageId: textResponse.data?.idMessage,
        pdfMessageId: pdfResponse.data?.idMessage
      };
    } else {
      return {
        success: true,
        message: 'Text message sent successfully via Green API',
        provider: 'Green API',
        textMessageId: textResponse.data?.idMessage,
        pdfMessageId: null
      };
    }
    
  } catch (error) {
    console.error('❌ Error sending WhatsApp ticket:', error);
    return {
      success: false,
      error: error.message,
      provider: 'Green API',
      details: error.response?.data || error.message
    };
  }
}

module.exports = {
  generateTicketForBooking,
  uploadFileToSupabase,
  sendWhatsAppTicket,
  getPublicTicketUrl,
  extractBookingData,
  generateTicketId
};
