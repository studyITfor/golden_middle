// Enhanced ticket generation utilities for GoldenMiddle
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
  console.log('⚠️ Supabase credentials not found, using local storage fallback');
}

// Generate ticket using PDF/PNG template
async function generateTicketFromTemplate(booking, templatePath, outputPath) {
  console.log('🎫 Generating ticket from template:', { templatePath, outputPath });
  
  try {
    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template file not found: ${templatePath}`);
    }

    // Determine template type
    const templateExt = path.extname(templatePath).toLowerCase();
    const isPngTemplate = templateExt === '.png';
    
    console.log(`📄 Loading template ${isPngTemplate ? 'PNG' : 'PDF'}...`);
    
    let pdfDoc;
    let firstPage;
    let width, height;
    
    if (isPngTemplate) {
      // Create new PDF document for PNG template
      pdfDoc = await PDFDocument.create();
      const templateBytes = fs.readFileSync(templatePath);
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
    
    console.log('📐 Page dimensions:', { width, height });

    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Generate English text for PDF compatibility (Russian text will be sent via WhatsApp)
    const ticketText = `Hello, ${booking.first_name || 'Guest'}!

Your golden ticket for GOLDENMIDDLE is ready!

Date: 26 October 2025
Time: 18:00
Place: Asman
Your seat: Table ${booking.table_number || booking.table || 'N/A'}, Seat ${booking.seat_number || booking.seat || 'N/A'}
Price: 5500 Som
Ticket ID: ${booking.ticket_id || 'N/A'}

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
    const qrDataUrl = await QRCode.toDataURL(booking.ticket_id || 'N/A', {
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
    firstPage.drawText(booking.ticket_id || 'N/A', {
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
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, pdfBytes);
    
    console.log('✅ Ticket generated successfully!');
    console.log('📁 Output file:', outputPath);
    console.log('📊 File size:', (pdfBytes.length / 1024).toFixed(2), 'KB');
    
    return {
      success: true,
      outputPath: outputPath,
      fileSize: pdfBytes.length
    };

  } catch (error) {
    console.error('❌ Error generating ticket:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Generate ticket for booking with template support
async function generateTicketForBooking(booking) {
  const ticketId = booking.ticket_id || ('T' + Date.now().toString(36).toUpperCase());
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
      isTemp: false
    };
  } catch (error) {
    console.error('❌ Error generating ticket from template:', error);
    // Fallback to text file
    return generateTextTicket(booking, ticketId);
  }
}

// Create a basic template if none exists
async function createBasicTemplate(templatePath) {
  console.log('🎫 Creating basic ticket template...');
  try {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([400, 600]);
    const { width, height } = page.getSize();

    // Embed fonts
    const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Background (golden look)
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(1, 0.84, 0) // Gold color
    });

    // Border
    page.drawRectangle({
      x: 20,
      y: 20,
      width: width - 40,
      height: height - 40,
      borderColor: rgb(0.8, 0.6, 0),
      borderWidth: 5,
      color: rgb(1, 1, 1) // White inner background
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
    
    page.drawText('Name and Surname', {
      x: 50,
      y: height - 220,
      size: 12,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5)
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
      width: 100,
      height: 100,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1
    });
    page.drawText('QR Code Here', {
      x: width - 90,
      y: 95,
      size: 10,
      font: regularFont,
      color: rgb(0.5, 0.5, 0.5)
    });

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(templatePath, pdfBytes);
    console.log('✅ Basic template created successfully!');
    console.log('📁 Template saved to:', templatePath);
    console.log('📊 File size:', (fs.statSync(templatePath).size / 1024).toFixed(2), 'KB');

  } catch (error) {
    console.error('❌ Error creating basic template:', error);
    throw error;
  }
}

// Fallback text ticket generation
function generateTextTicket(booking, ticketId) {
  const txtFilename = `${ticketId}.txt`;
  const txtFilepath = path.join(__dirname, '..', 'tickets', txtFilename);
  const contentLines = [
    `🎫 TICKET CONFIRMED 🎫`,
    ``,
    `Ticket ID: ${ticketId}`,
    `Booking ID: ${booking.booking_string_id || booking.id}`,
    `Name: ${booking.first_name} ${booking.last_name}`,
    `Phone: ${booking.user_phone || booking.phone}`,
    `Table: ${booking.table_number || booking.table}`,
    `Seat: ${booking.seat_number || booking.seat}`,
    `Date: ${booking.created_at}`,
    `Status: ✅ CONFIRMED & PAID`,
    ``,
    `This ticket is valid for entry to the event.`,
    `Please present this ticket at the entrance.`,
    ``,
    `Thank you for your booking! 🎓`
  ];
  
  // Ensure tickets directory exists
  const ticketsDir = path.dirname(txtFilepath);
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
  }
  
  fs.writeFileSync(txtFilepath, contentLines.join('\n'), 'utf8');
  return { 
    ticketId, 
    path: `/tickets/${txtFilename}`, 
    localPath: txtFilepath, 
    isTemp: false
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

// Send WhatsApp message with Russian text and emojis
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
        textMessageId: textResponse.data?.idMessage
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
  generateTicketFromTemplate,
  uploadFileToSupabase,
  sendWhatsAppTicket,
  createBasicTemplate
};
