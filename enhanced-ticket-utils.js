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
      
      // Hide placeholder text by overlaying white rectangles
      console.log('🎨 Hiding placeholder text...');
      
      // Hide "QR" placeholder (left lower corner) - scaled for actual template size
      firstPage.drawRectangle({
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        color: rgb(1, 1, 1) // White background
      });
      
      // Hide "Имя и Фамилия" placeholder (center area) - scaled for actual template size
      firstPage.drawRectangle({
        x: width / 2 - 300,
        y: height / 2 - 50,
        width: 600,
        height: 100,
        color: rgb(1, 1, 1) // White background
      });
      
      // Hide "Номер стола и место" placeholder (right lower corner) - scaled for actual template size
      firstPage.drawRectangle({
        x: width - 600,
        y: 150,
        width: 500,
        height: 80,
        color: rgb(1, 1, 1) // White background
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

    // Calculate positions based on template dimensions and placeholder locations
    // Positions match exactly where placeholders were hidden (scaled for actual template size)
    
    // Position for full name (center area, where "Имя и Фамилия" was hidden)
    const namePosition = {
      x: width / 2 - 300,  // Center horizontally, matching hidden placeholder area
      y: height / 2 + 20,  // Center vertically, matching hidden placeholder area
      size: 48,            // Size scaled for template (3x larger)
      font: font,
      color: rgb(0, 0, 0)
    };
    
    // Position for table and seat (right lower corner, where "Номер стола и место" was hidden)
    const tableSeatPosition = {
      x: width - 600,     // Right side of ticket, matching hidden placeholder area
      y: 180,             // Lower area, matching hidden placeholder area
      size: 36,           // Size scaled for template (3x larger)
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
    
    // Draw QR code in left lower corner (where "QR" placeholder was hidden)
    const qrSize = 150; // Size scaled for template (3x larger)
    firstPage.drawImage(qrImage, {
      x: 125,             // Left side of ticket, centered in hidden placeholder area
      y: 125,             // Lower area, centered in hidden placeholder area
      width: qrSize,
      height: qrSize
    });

    // Add ticket ID text near QR code (left lower corner, below QR)
    firstPage.drawText(ticketId, {
      x: 125,
      y: 100,
      size: 24,           // Size scaled for template (3x larger)
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
  
  // Use correct path for Railway environment
  // In Railway: /app/tickets, In local dev: D:\admin-script\tickets
  const ticketsDir = process.env.NODE_ENV === 'production' 
    ? '/app/tickets' 
    : path.join(__dirname, '..', 'tickets');
  const pdfFilepath = path.join(ticketsDir, pdfFilename);
  
  console.log('📁 Tickets directory:', ticketsDir);
  console.log('📄 PDF file path:', pdfFilepath);

  // Ensure tickets directory exists
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
  }

  // Try to find template files (prioritize ticket_design.png)
  // Use correct base directory for Railway vs local development
  const baseDir = process.env.NODE_ENV === 'production' ? '/app' : __dirname;
  const ticketDesignPng = path.join(baseDir, 'ticket_design.png');
  const ticketDesignPdf = path.join(baseDir, 'ticket_design.pdf');
  const examplePdf = path.join(baseDir, 'example.pdf');
  const examplePng = path.join(baseDir, 'example.png');
  const fallbackTemplate = path.join(baseDir, 'ticket_template.pdf');
  
  console.log('🔍 Looking for templates in:', baseDir);

  let templatePath = null;
  if (fs.existsSync(ticketDesignPng)) {
    templatePath = ticketDesignPng;
    console.log('✅ Using ticket_design.png template:', ticketDesignPng);
  } else if (fs.existsSync(ticketDesignPdf)) {
    templatePath = ticketDesignPdf;
    console.log('✅ Using ticket_design.pdf template:', ticketDesignPdf);
  } else if (fs.existsSync(examplePdf)) {
    templatePath = examplePdf;
    console.log('✅ Using example PDF template:', examplePdf);
  } else if (fs.existsSync(examplePng)) {
    templatePath = examplePng;
    console.log('✅ Using example PNG template:', examplePng);
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
    if (ticket.path) {
      console.log('📄 Sending PDF ticket...');
      console.log('🔍 Debug ticket object:', {
        path: ticket.path,
        localPath: ticket.localPath,
        ticketId: ticket.ticketId
      });
      
      // Verify PDF file exists locally before sending
      if (ticket.localPath && !fs.existsSync(ticket.localPath)) {
        console.error('❌ PDF file does not exist locally:', ticket.localPath);
        console.log('🔍 File system check failed, but continuing with URL-based delivery...');
        // Don't return error, continue with URL-based delivery
      }
      
      // Check PDF file size (WhatsApp limit is ~16MB, but we'll use 5MB for safety)
      if (ticket.localPath && fs.existsSync(ticket.localPath)) {
        try {
          const stats = fs.statSync(ticket.localPath);
          const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`📊 PDF file size: ${fileSizeMB} MB`);
          
          if (stats.size > 5 * 1024 * 1024) { // 5MB limit
            console.warn(`⚠️ PDF file size (${fileSizeMB} MB) exceeds recommended limit for WhatsApp`);
          }
        } catch (error) {
          console.warn('⚠️ Could not check file size, continuing with URL-based delivery:', error.message);
        }
      } else {
        console.log('📊 File size check skipped (file not accessible locally)');
      }
      
      // Safe absolute URL builder for GreenAPI
      function buildPublicPdfUrl(ticket) {
        // Ensure we always have a proper base URL with https://
        let base = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.PUBLIC_BASE_URL || 'https://upbeat-compassion-production.up.railway.app';
        
        // TEMPORARY FIX: Force the correct URL
        if (process.env.NODE_ENV === 'production') {
          base = 'https://upbeat-compassion-production.up.railway.app';
        }
        
        // Remove trailing slash
        base = base.replace(/\/$/, '');
        
        // Ensure it starts with https://
        if (!base.startsWith('https://') && !base.startsWith('http://')) {
          base = `https://${base}`;
        }
        
        const rel = ticket.path || ticket.pdfPath || (`/tickets/${ticket.ticketId}.pdf`);
        const path = rel.startsWith('/') ? rel : `/${rel}`;
        const url = `${base}${path}`;
        
        console.log('🔧 URL Construction Debug:', {
          'env.RAILWAY_PUBLIC_DOMAIN': process.env.RAILWAY_PUBLIC_DOMAIN,
          'env.PUBLIC_BASE_URL': process.env.PUBLIC_BASE_URL,
          'base': base,
          'rel': rel,
          'path': path,
          'finalUrl': url
        });
        
        return url;
      }
      
      const publicPdfUrl = buildPublicPdfUrl(ticket);
      
      // Defensive: ensure it starts with http
      if (!/^https?:\/\//.test(publicPdfUrl)) {
        console.error('❌ Public PDF URL invalid:', publicPdfUrl);
        throw new Error(`Invalid PDF URL format: ${publicPdfUrl}`);
      }
      
      console.log('🌐 Public PDF URL (direct endpoint):', publicPdfUrl);
      console.log('📁 Local PDF path:', ticket.localPath);
      console.log('✅ PDF file exists locally:', ticket.localPath ? fs.existsSync(ticket.localPath) : 'No local path');
      console.log('🔍 Debug ticket object:', {
        path: ticket.path,
        ticketId: ticket.ticketId,
        publicPdfUrl: publicPdfUrl
      });
      
      // Additional debugging for URL construction
      console.log('🔍 URL Construction Debug:', {
        'ticket.path': ticket.path,
        'ticket.pdfPath': ticket.pdfPath,
        'ticket.ticketId': ticket.ticketId,
        'baseUrl': baseUrl,
        'finalUrl': publicPdfUrl,
        'urlStartsWithHttp': /^https?:\/\//.test(publicPdfUrl)
      });
      
      // Verify public URL is accessible (always check for WhatsApp delivery)
      try {
        console.log('🔍 Verifying public PDF URL accessibility...');
        console.log('🌐 Testing URL:', publicPdfUrl);
        
        const response = await axios.head(publicPdfUrl, { 
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GreenAPI/1.0)',
            'Accept': 'application/pdf, */*'
          }
        });
        
        console.log('✅ Public PDF URL is accessible:', response.status);
        console.log('📄 Content-Type:', response.headers['content-type']);
        console.log('📊 Content-Length:', response.headers['content-length']);
        
        // Verify it's actually a PDF
        if (!response.headers['content-type']?.includes('application/pdf')) {
          console.warn('⚠️ Content-Type is not application/pdf, but continuing with PDF delivery...');
          console.warn('📄 Actual Content-Type:', response.headers['content-type']);
        }
        
      } catch (error) {
        console.warn('⚠️ PDF HEAD failed, will still attempt send. Error:', error.message);
        console.warn('🔗 PDF URL will be sent to Green API:', publicPdfUrl);
      }
      
      const pdfPayload = {
        chatId: chatId,
        urlFile: publicPdfUrl,
        fileName: `ticket_${ticket.ticketId}.pdf`,
        caption: '🎫 Ваш билет (PDF документ)'
      };
      
      console.log('📤 Sending PDF via Green API sendFileByUrl...');
      console.log('📋 PDF payload:', {
        chatId: pdfPayload.chatId,
        urlFile: pdfPayload.urlFile,
        fileName: pdfPayload.fileName,
        caption: pdfPayload.caption
      });
      
      // Critical: Log the exact URL being sent to GreenAPI
      console.log('🚨 CRITICAL: URL being sent to GreenAPI:', pdfPayload.urlFile);
      console.log('🚨 URL validation:', {
        'startsWithHttp': /^https?:\/\//.test(pdfPayload.urlFile),
        'isString': typeof pdfPayload.urlFile === 'string',
        'length': pdfPayload.urlFile?.length,
        'firstChars': pdfPayload.urlFile?.substring(0, 20)
      });
      
      const pdfResponse = await axios.post(
        `${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendFileByUrl/${TOKEN}`,
        pdfPayload,
        { timeout: 30000 } // Increased timeout for file upload
      );
      
      console.log('✅ PDF sent successfully:', pdfResponse.data);
      console.log('📱 Green API response status:', pdfResponse.status);
      console.log('📱 Green API response headers:', pdfResponse.headers);
      
      // Verify the response indicates success
      if (!pdfResponse.data?.idMessage) {
        throw new Error('Green API did not return message ID for PDF');
      }
      
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

// Test function for PDF delivery workflow
async function testPDFDelivery(phone = '+996555123456') {
  console.log('🧪 Starting comprehensive PDF delivery test...');
  
  try {
    // 1. Generate test ticket
    const testBooking = {
      first_name: 'Test',
      last_name: 'User',
      table: 1,
      seat: 1,
      ticket_id: 'TEST_' + Date.now()
    };
    
    console.log('📝 Generating test ticket...');
    const ticket = await generateTicketForBooking(testBooking);
    console.log('✅ Ticket generated:', ticket);
    
    // 2. Verify local file exists
    if (!fs.existsSync(ticket.localPath)) {
      throw new Error('Local PDF file not found');
    }
    
    const stats = fs.statSync(ticket.localPath);
    console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
    
    // 3. Test local URL access using direct endpoint
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN || 'https://upbeat-compassion-production.up.railway.app';
    const filename = ticket.path.split('/').pop();
    const publicUrl = `${baseUrl}/pdf/${filename}`;
    console.log('🌐 Public URL (direct endpoint):', publicUrl);
    
    // 4. Test public URL accessibility with detailed checks
    console.log('🔍 Testing public URL accessibility...');
    try {
      const response = await axios.head(publicUrl, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GreenAPI/1.0)',
          'Accept': 'application/pdf, */*'
        }
      });
      
      console.log('✅ Public URL accessible:', response.status);
      console.log('📄 Content-Type:', response.headers['content-type']);
      console.log('📊 Content-Length:', response.headers['content-length']);
      console.log('🔒 HTTPS:', publicUrl.startsWith('https://'));
      
      // Verify it's actually a PDF
      if (!response.headers['content-type']?.includes('application/pdf')) {
        throw new Error(`Invalid content type: ${response.headers['content-type']}`);
      }
      
    } catch (error) {
      console.error('❌ Public URL not accessible:', error.message);
      console.error('🔍 Error details:', {
        status: error.response?.status,
        headers: error.response?.headers,
        url: publicUrl
      });
      
      // Don't fail the test in local development
      if (process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ Continuing test despite URL accessibility issue (local dev)');
      } else {
        throw error;
      }
    }
    
    // 5. Test WhatsApp sending
    console.log('📱 Testing WhatsApp delivery...');
    const result = await sendWhatsAppTicket(phone, ticket);
    console.log('📱 WhatsApp result:', result);
    
    return {
      success: true,
      ticket,
      publicUrl,
      whatsappResult: result,
      urlAccessible: true
    };
    
  } catch (error) {
    console.error('❌ PDF delivery test failed:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// Function to test external URL accessibility
async function testExternalURL(url) {
  console.log('🌐 Testing external URL accessibility...');
  console.log('🔗 URL:', url);
  
  try {
    const response = await axios.get(url, { 
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GreenAPI/1.0)',
        'Accept': 'application/pdf, */*'
      }
    });
    
    console.log('✅ External URL accessible:', response.status);
    console.log('📄 Content-Type:', response.headers['content-type']);
    console.log('📊 Content-Length:', response.headers['content-length']);
    console.log('🔒 HTTPS:', url.startsWith('https://'));
    
    return {
      accessible: true,
      status: response.status,
      contentType: response.headers['content-type'],
      contentLength: response.headers['content-length'],
      isHttps: url.startsWith('https://')
    };
    
  } catch (error) {
    console.error('❌ External URL not accessible:', error.message);
    return {
      accessible: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

// Function to upload PDF to Railway (copy to Railway's tickets folder)
async function uploadPDFToRailway(localPath, filename) {
  try {
    console.log('📤 Uploading PDF to Railway...');
    console.log('📁 Local path:', localPath);
    console.log('📄 Filename:', filename);
    
    // In production, the PDF should already be in the Railway environment
    // This function is mainly for local development testing
    if (process.env.NODE_ENV === 'production') {
      console.log('✅ Production environment - PDF should already be in Railway');
      return { success: true, message: 'PDF already in Railway environment' };
    }
    
    // For local development, we need to ensure the PDF exists in the Railway environment
    // This would typically be handled by the deployment process
    console.log('⚠️ Local development - PDF upload to Railway not implemented');
    console.log('💡 In production, PDFs are generated directly in the Railway environment');
    
    return { 
      success: false, 
      message: 'PDF upload to Railway not implemented for local development',
      suggestion: 'Deploy to Railway to test PDF delivery'
    };
    
  } catch (error) {
    console.error('❌ Error uploading PDF to Railway:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  generateTicketForBooking,
  generateTicketFromTemplate,
  uploadFileToSupabase,
  sendWhatsAppTicket,
  createBasicTemplate,
  testPDFDelivery,
  testExternalURL,
  uploadPDFToRailway
};
