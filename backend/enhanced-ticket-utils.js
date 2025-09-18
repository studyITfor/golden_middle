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

// Generate ticket using PDF/PNG template with placeholder replacement
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

    // Extract real booking data for proper personalization
    const firstName = booking.first_name || booking.firstName || 'Guest';
    const lastName = booking.last_name || booking.lastName || '';
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const table = booking.table_number || booking.table || 'N/A';
    const seat = booking.seat_number || booking.seat || 'N/A';
    const ticketId = booking.ticket_id || booking.ticketId || 'N/A';

    console.log('✏️ Using real booking data:', { fullName, table, seat, ticketId });

    // Embed fonts for text overlay
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Calculate positions based on template dimensions and example image reference
    // Template dimensions: 460.8 x 250.08 (based on actual template)
    // Positions match the example image exactly
    
    // Position for full name (center area, matching template placeholder "FULL NAME")
    const namePosition = {
      x: width / 2 - 40,  // Center horizontally, matching template
      y: height / 2 + 10, // Center vertically, matching template
      size: 16,           // Size matching template
      font: font,
      color: rgb(0, 0, 0)
    };
    
    // Position for table and seat (right lower corner, matching template placeholder "TABLE AND SEAT")
    const tableSeatPosition = {
      x: width - 150,     // Right side of ticket, matching template
      y: 60,              // Lower area, matching template position
      size: 12,           // Size matching template
      font: regularFont,
      color: rgb(0, 0, 0)
    };

    // Overlay the user's full name in the center (Cyrillic for proper rendering)
    console.log('✏️ Adding user name to template...');
    try {
      firstPage.drawText(fullName, namePosition);
    } catch (cyrillicError) {
      console.log('⚠️ Cyrillic rendering failed, using transliteration fallback');
      // Fallback to transliteration if Cyrillic fails
      const transliterateName = (name) => {
        const cyrillicToLatin = {
          'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
          'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
          'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
          'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
          'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
          'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
          'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
          'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
          'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        };
        return name.split('').map(char => cyrillicToLatin[char] || char).join('');
      };
      const fallbackName = transliterateName(fullName);
      firstPage.drawText(fallbackName, namePosition);
    }

    // Overlay table and seat information (matching example format exactly)
    console.log('✏️ Adding table and seat info to template...');
    const tableSeatText = `Стол ${table} Место ${seat}`; // Exact format as in example
    try {
      firstPage.drawText(tableSeatText, tableSeatPosition);
    } catch (cyrillicError) {
      console.log('⚠️ Cyrillic rendering failed for table/seat, using English fallback');
      const fallbackTableSeatText = `Table ${table} Seat ${seat}`;
      firstPage.drawText(fallbackTableSeatText, tableSeatPosition);
    }

    // Generate and overlay QR code with real ticket ID
    console.log('🔲 Generating QR code for ticket ID:', ticketId);
    const qrDataUrl = await QRCode.toDataURL(ticketId, {
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
    
    // Draw QR code in left lower corner (matching template QR placeholder)
    const qrSize = 60; // Size matching the template QR placeholder
    firstPage.drawImage(qrImage, {
      x: 30,              // Left side of ticket, matching template position
      y: 30,              // Lower area, matching template position
      width: qrSize,
      height: qrSize
    });

    // Add ticket ID text near QR code (left lower corner, matching template)
    firstPage.drawText(ticketId, {
      x: 30,
      y: 20,
      size: 8,
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

  // Try to find template files (prioritize example templates)
  const examplePdf = path.join(__dirname, 'example.pdf');
  const examplePng = path.join(__dirname, 'example.png');
  const templatePdf = path.join(__dirname, 'ticket_design.pdf');
  const templatePng = path.join(__dirname, 'ticket_design.png');
  const fallbackTemplate = path.join(__dirname, 'ticket_template.pdf');

  let templatePath = null;
  if (fs.existsSync(examplePdf)) {
    templatePath = examplePdf;
    console.log('✅ Using example PDF template:', examplePdf);
  } else if (fs.existsSync(examplePng)) {
    templatePath = examplePng;
    console.log('✅ Using example PNG template:', examplePng);
  } else if (fs.existsSync(templatePdf)) {
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
    // Extract real user data for proper personalization
    const firstName = ticket.firstName || ticket.first_name || 'Guest';
    const lastName = ticket.lastName || ticket.last_name || '';
    const fullName = lastName ? `${firstName} ${lastName}` : firstName;
    const table = ticket.table || 'N/A';
    const seat = ticket.seat || 'N/A';
    const ticketId = ticket.ticketId || 'N/A';

    console.log('📱 Using real user data for WhatsApp:', { fullName, table, seat, ticketId });

    // First send the Russian text message with emojis (exact format as specified)
    const russianMessage = `🎫 Здравствуйте, ${fullName}!

🎉 Ваш золотой билет на GOLDENMIDDLE готов!

📅 Дата: 26 октября 2025
⏰ Время: 18:00
📍 Место: Асман
🪑 Ваше место: Стол ${table}, Место ${seat}
💵 Цена: 5500 Сом
🆔 ID билета: ${ticketId}

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
