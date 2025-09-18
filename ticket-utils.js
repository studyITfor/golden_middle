// backend/ticket-utils.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');

const config = require('./config');

const GREEN_API_URL = process.env.GREEN_API_URL || config.whatsapp.apiUrl;
const GREEN_API_MEDIA_URL = process.env.GREEN_API_MEDIA_URL;
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

// Generate ticket files (PDF and Image)
async function generateTicketForBooking(booking) {
  const os = require('os');
  const tempDir = os.tmpdir();
  const ticketId = booking.ticket_id || ('T' + Date.now().toString(36).toUpperCase());
  const pdfFilename = `${ticketId}.pdf`;
  const imgFilename = `${ticketId}.png`;
  const pdfFilepath = path.join(tempDir, pdfFilename);
  const imgFilepath = path.join(tempDir, imgFilename);

  // Create both PDF and image tickets if not exist
  if (!fs.existsSync(pdfFilepath) || !fs.existsSync(imgFilepath)) {
    try {
      const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      
      // Generate HTML content for the ticket
      const htmlContent = generateTicketHTML(booking, ticketId);
      
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
      
      // Generate PNG image
      const imgBuffer = await page.screenshot({
        type: 'png',
        fullPage: true,
        quality: 100
      });
      
      await browser.close();
      
      // Save both files
      fs.writeFileSync(pdfFilepath, pdfBuffer);
      fs.writeFileSync(imgFilepath, imgBuffer);
      
      console.log('✅ PDF and Image tickets generated successfully:', { 
        ticketId, 
        pdfFilepath, 
        imgFilepath 
      });
    } catch (error) {
      console.error('❌ Error generating ticket files:', error);
      // Fallback to text file
      const txtFilename = `${ticketId}.txt`;
      const txtFilepath = path.join(tempDir, txtFilename);
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
      fs.writeFileSync(txtFilepath, contentLines.join('\n'), 'utf8');
      return { 
        ticketId, 
        path: `/tickets/${txtFilename}`, 
        localPath: txtFilepath, 
        isTemp: true,
        imagePath: null,
        imageLocalPath: null
      };
    }
  }

  return { 
    ticketId, 
    path: `/tickets/${pdfFilename}`, 
    localPath: pdfFilepath, 
    isTemp: true,
    imagePath: `/tickets/${imgFilename}`,
    imageLocalPath: imgFilepath
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

// Generate HTML content for PDF ticket matching the provided design
function generateTicketHTML(booking, ticketId) {
  const currentDate = new Date().toLocaleDateString('ru-RU');
  const currentTime = new Date().toLocaleTimeString('ru-RU');
  
  return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Билет - ${ticketId}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap');
            
            body {
                font-family: 'Arial', sans-serif;
                margin: 0;
                padding: 20px;
                background: #f5f5f5;
                color: #000;
            }
            .ticket {
                background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
                border: 8px solid #000;
                border-radius: 0;
                padding: 40px;
                max-width: 600px;
                margin: 0 auto;
                position: relative;
                box-shadow: 0 0 20px rgba(0,0,0,0.3);
            }
            
            /* Decorative border elements */
            .ticket::before {
                content: '';
                position: absolute;
                top: -4px;
                left: -4px;
                right: -4px;
                bottom: -4px;
                border: 2px solid #000;
                border-radius: 0;
                background: transparent;
            }
            
            .ticket::after {
                content: '';
                position: absolute;
                top: 20px;
                left: 20px;
                right: 20px;
                bottom: 20px;
                border: 1px solid #000;
                border-radius: 0;
                background: transparent;
            }
            
            .kgma {
                text-align: center;
                font-size: 24px;
                font-weight: bold;
                color: #000;
                margin-bottom: 10px;
                letter-spacing: 2px;
            }
            
            .main-title {
                text-align: center;
                font-family: 'Playfair Display', serif;
                font-size: 48px;
                font-weight: 900;
                color: #000;
                margin: 20px 0;
                text-shadow: 2px 2px 0px #fff;
                letter-spacing: 3px;
            }
            
            .event-details {
                display: flex;
                justify-content: space-between;
                margin: 30px 0;
                font-size: 18px;
                font-weight: bold;
                color: #000;
            }
            
            .event-detail {
                flex: 1;
                text-align: center;
            }
            
            .attendee-section {
                margin: 40px 0;
                text-align: center;
            }
            
            .attendee-label {
                font-size: 20px;
                font-weight: bold;
                color: #000;
                margin-bottom: 10px;
            }
            
            .attendee-line {
                width: 100%;
                height: 3px;
                background: #000;
                margin: 10px 0;
            }
            
            .attendee-name {
                font-size: 24px;
                font-weight: bold;
                color: #000;
                margin: 20px 0;
                min-height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .bottom-section {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 40px;
            }
            
            .qr-section {
                width: 120px;
                height: 120px;
                border: 3px solid #000;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #fff;
                font-size: 16px;
                font-weight: bold;
                color: #000;
                text-align: center;
            }
            
            .seat-info {
                text-align: right;
                font-size: 18px;
                font-weight: bold;
                color: #000;
            }
            
            .seat-line {
                width: 200px;
                height: 3px;
                background: #000;
                margin: 10px 0;
            }
            
            /* Perforated edges effect */
            .ticket::before {
                background-image: 
                    radial-gradient(circle at 0 50%, transparent 0, transparent 8px, #000 8px, #000 10px, transparent 10px),
                    radial-gradient(circle at 100% 50%, transparent 0, transparent 8px, #000 8px, #000 10px, transparent 10px);
                background-size: 20px 20px;
                background-position: 0 0, 100% 0;
                background-repeat: repeat-y;
            }
        </style>
    </head>
    <body>
        <div class="ticket">
            <div class="kgma">КГМА</div>
            <div class="main-title">GOLDENMIDDLE</div>
            
            <div class="event-details">
                <div class="event-detail">Дата: 26 октября</div>
                <div class="event-detail">Время: 18:00</div>
                <div class="event-detail">Место: Асман</div>
            </div>
            
            <div class="attendee-section">
                <div class="attendee-label">Имя и фамилия</div>
                <div class="attendee-line"></div>
                <div class="attendee-name">${booking.first_name || ''} ${booking.last_name || ''}</div>
            </div>
            
            <div class="bottom-section">
                <div class="qr-section">
                    QR<br>${ticketId}
                </div>
                <div class="seat-info">
                    Номер стола и место<br>
                    <div class="seat-line"></div>
                    Стол ${booking.table_number || booking.table}, Место ${booking.seat_number || booking.seat}
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
}

// Send both image and PDF via Green API (with fallback to text)
async function sendBothTicketFiles(phone, ticket) {
  const cleanPhone = phone.replace(/[^\d]/g, '');
  const chatId = cleanPhone + '@c.us';
  
  console.log('📱 Sending ticket files to:', phone, 'chatId:', chatId);
  console.log('📋 Ticket details:', { 
    ticketId: ticket.ticketId, 
    pdfUrl: ticket.pdfUrl, 
    imageUrl: ticket.imageUrl,
    hasPdf: !!ticket.pdfUrl,
    hasImage: !!ticket.imageUrl
  });
  
  try {
    const results = [];
    
    // Send image if available
    if (ticket.imageUrl) {
      console.log('📷 Sending ticket image...');
      const imagePayload = {
        chatId: chatId,
        urlFile: ticket.imageUrl,
        fileName: `ticket_${ticket.ticketId}.png`,
        caption: '🎫 Ваш билет (изображение)'
      };
      
      const imageResponse = await axios.post(
        `${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendFileByUrl/${TOKEN}`,
        imagePayload,
        { timeout: 15000 }
      );
      
      console.log('✅ Image sent successfully:', imageResponse.data);
      results.push({ type: 'image', success: true, messageId: imageResponse.data?.idMessage });
      
      // Wait 1 second between sends
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Send PDF if available
    if (ticket.pdfUrl) {
      console.log('📄 Sending ticket PDF...');
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
      results.push({ type: 'pdf', success: true, messageId: pdfResponse.data?.idMessage });
    }
    
    // If no files available, send text message
    if (!ticket.pdfUrl && !ticket.imageUrl) {
      console.log('📝 No files available, sending text message...');
      const textPayload = {
        chatId: chatId,
        message: `🎫 Ваш билет подтвержден!\n\nTicket ID: ${ticket.ticketId}\n\nСпасибо за бронирование!`
      };
      
      const textResponse = await axios.post(
        `${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendMessage/${TOKEN}`,
        textPayload,
        { timeout: 15000 }
      );
      
      console.log('✅ Text message sent successfully:', textResponse.data);
      results.push({ type: 'text', success: true, messageId: textResponse.data?.idMessage });
    }
    
    return {
      success: true,
      message: `Ticket sent successfully via Green API (${results.length} items)`,
      provider: 'Green API',
      results: results,
      imageMessageId: results.find(r => r.type === 'image')?.messageId,
      pdfMessageId: results.find(r => r.type === 'pdf')?.messageId,
      textMessageId: results.find(r => r.type === 'text')?.messageId
    };
    
  } catch (error) {
    console.error('❌ Error sending ticket files:', error);
    return {
      success: false,
      error: error.message,
      provider: 'Green API',
      details: error.response?.data || error.message
    };
  }
}

async function sendWhatsAppTicket(phone, ticket) {
  console.log('📱 Starting WhatsApp send process:', {
    phone: phone,
    ticketId: ticket && ticket.ticketId,
    hasGreenAPI: !!(GREEN_API_URL && ID_INSTANCE && TOKEN),
    timestamp: new Date().toISOString()
  });

  // Validate phone format
  if (!phone || !/^\+\d{10,15}$/.test(phone)) {
    console.error('❌ Invalid phone format:', phone);
    return { success: false, error: 'Invalid phone format' };
  }

  // Check for Green API credentials
  if (GREEN_API_URL && ID_INSTANCE && TOKEN) {
    console.log('📱 Using Green API for WhatsApp send...');
    
    try {
      // First, send a text message
      const textMessage = `🎫 *TICKET CONFIRMED* 🎫

*Ticket ID:* ${ticket && ticket.ticketId || 'N/A'}
*Event:* University Event
*Date:* ${new Date().toLocaleDateString('ru-RU')}
*Time:* ${new Date().toLocaleTimeString('ru-RU')}

*Status:* ✅ CONFIRMED & PAID

This ticket is valid for entry to the event.
Please present this ticket at the entrance.

Thank you for your booking! 🎓`;

      const textResponse = await sendWithRetry(async () => {
        return await axios.post(`${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendMessage/${TOKEN}`, {
          chatId: phone + '@c.us',
          message: textMessage
        });
      });

      console.log('✅ Text message sent via Green API:', textResponse.data);

      // Then, send the ticket file if available using sendFileByUrl
      if (ticket && ticket.path) {
        console.log('📎 Sending PDF ticket file via Green API sendFileByUrl...');
        
        // Use the Railway domain for the media URL
        const mediaUrl = `https://upbeat-compassion-production.up.railway.app${ticket.path}`;
        console.log('📱 Media URL:', mediaUrl);
        
        const fileResponse = await sendWithRetry(async () => {
          return await axios.post(`${GREEN_API_URL}/waInstance${ID_INSTANCE}/sendFileByUrl/${TOKEN}`, {
            chatId: phone + '@c.us',
            urlFile: mediaUrl,
            fileName: `ticket_${ticket.ticketId}.pdf`,
            caption: `🎫 Ваш билет подтвержден!\n\nID билета: ${ticket.ticketId}\n\nБилет прикреплен к сообщению. Пожалуйста, сохраните его для входа на мероприятие.`
          });
        });

        console.log('✅ PDF file sent via Green API sendFileByUrl:', fileResponse.data);
      }

      // Log successful send
      await logWhatsAppSend(phone, ticket, {
        success: true,
        provider: 'Green API',
        textMessageId: textResponse.data?.idMessage,
        fileMessageId: fileResponse?.data?.idMessage
      });

      return { 
        success: true, 
        message: 'WhatsApp ticket sent successfully via Green API',
        provider: 'Green API',
        textMessageId: textResponse.data?.idMessage,
        fileMessageId: fileResponse?.data?.idMessage
      };

    } catch (error) {
      console.error('❌ Green API send failed:', error.message);
      
      // Log failed send
      await logWhatsAppSend(phone, ticket, {
        success: false,
        provider: 'Green API',
        error: error.message
      });

      // Fall back to simulation
      console.log('📱 Falling back to simulation...');
    }
  }

  // Fallback to simulation
  console.log('📱 Using simulation for WhatsApp send...');
  
  const message = `🎫 *TICKET CONFIRMED* 🎫

*Ticket ID:* ${ticket && ticket.ticketId || 'N/A'}
*Event:* University Event
*Date:* ${new Date().toLocaleDateString('ru-RU')}
*Time:* ${new Date().toLocaleTimeString('ru-RU')}

*Status:* ✅ CONFIRMED & PAID

This ticket is valid for entry to the event.
Please present this ticket at the entrance.

Thank you for your booking! 🎓`;

  console.log('📱 WhatsApp message content:');
  console.log(message);
  
  // Log simulation
  await logWhatsAppSend(phone, ticket, {
    success: true,
    provider: 'SIMULATION',
    simulated: true
  });
  
  console.log('✅ WhatsApp ticket sent successfully (simulated)');
  return { 
    success: true, 
    message: 'WhatsApp ticket sent successfully (simulated)', 
    simulated: true,
    provider: 'SIMULATION',
    textMessageId: 'SIMULATED-' + Date.now(),
    fileMessageId: 'SIMULATED-' + Date.now()
  };
}

// Retry function with exponential backoff
async function sendWithRetry(sendFunction, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendFunction();
    } catch (error) {
      console.log(`📱 Green API attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`📱 Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Log WhatsApp send attempts
async function logWhatsAppSend(phone, ticket, result) {
  const logsDir = path.resolve(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    phone: phone,
    ticketId: ticket && ticket.ticketId,
    ticketPath: ticket && ticket.path,
    provider: result.provider,
    success: result.success,
    simulated: result.simulated || false,
    textMessageId: result.textMessageId,
    fileMessageId: result.fileMessageId,
    error: result.error
  };
  
  const logFile = path.join(logsDir, 'whatsapp-sends.log');
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n', 'utf8');
  
  console.log('📝 WhatsApp send logged:', {
    phone: phone,
    ticketId: ticket && ticket.ticketId,
    success: result.success,
    provider: result.provider
  });
}

module.exports = { 
  generateTicketForBooking, 
  sendWhatsAppTicket, 
  sendBothTicketFiles, 
  uploadFileToSupabase 
};
