// Optimized server.js sections for GoldenMiddle booking system
// These sections replace the corresponding parts in server.js

// ============================================================================
// OPTIMIZED TICKET GENERATION AND WHATSAPP SENDING SECTION
// ============================================================================

// Replace the confirm-payment endpoint section with this optimized version
app.post('/api/confirm-payment', async (req, res) => {
  const { bookingId, paymentMethod, amount } = req.body;
  
  if (!bookingId) {
    return res.status(400).json({ success: false, message: 'Booking ID is required' });
  }

  try {
    // Get booking from database
    const bookingResult = await db.query('SELECT * FROM bookings WHERE id = $1 OR booking_string_id = $1', [bookingId]);
    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const updatedBooking = bookingResult.rows[0];
    
    // Update booking status to paid
    await db.query('UPDATE bookings SET status = $1, payment_method = $2, amount = $3, updated_at = now() WHERE id = $4', 
      ['paid', paymentMethod, amount, updatedBooking.id]);

    // Generate ticket using enhanced template system
    let ticket = null;
    let publicPdfUrl = null;
    try {
      const { generateTicketForBooking, uploadFileToSupabase, getPublicTicketUrl } = require('./enhanced-ticket-utils-fixed');
      ticket = await generateTicketForBooking(updatedBooking);
      
      // Upload PDF to external storage or use Railway public URL
      if (ticket && ticket.localPath) {
        const pdfFileName = path.basename(ticket.localPath);
        
        try {
          // Try Supabase first
          publicPdfUrl = await uploadFileToSupabase(ticket.localPath, `tickets/${pdfFileName}`);
          await db.query('UPDATE bookings SET ticket_path = $1 WHERE id = $2', 
            [publicPdfUrl, updatedBooking.id]);
        } catch (uploadError) {
          // Fallback to Railway public URL
          publicPdfUrl = getPublicTicketUrl(ticket.path, ticket.ticketId);
          await db.query('UPDATE bookings SET ticket_path = $1 WHERE id = $2', 
            [publicPdfUrl, updatedBooking.id]);
        }
      }
    } catch (e) {
      console.error('❌ Ticket generation error:', e);
    }

    // Send WhatsApp via Green API with optimized logging
    let whatsappResult = null;
    try {
      const phone = updatedBooking.user_phone || updatedBooking.phone;
      if (phone && /^\+\d{10,15}$/.test(phone)) {
        const ticketForWhatsApp = {
          ticketId: ticket?.ticketId || null,
          pdfUrl: publicPdfUrl || (ticket ? getPublicTicketUrl(ticket.path, ticket.ticketId) : null),
          firstName: ticket?.fullName || updatedBooking.first_name || 'Guest',
          table: updatedBooking.table_number || updatedBooking.table,
          seat: updatedBooking.seat_number || updatedBooking.seat
        };
        
        const { sendWhatsAppTicket } = require('./enhanced-ticket-utils-fixed');
        whatsappResult = await sendWhatsAppTicket(phone, ticketForWhatsApp);
        
        if (whatsappResult.success) {
          await db.query('UPDATE bookings SET whatsapp_sent = true, whatsapp_message_id = $1, ticket_id = $2, updated_at = now() WHERE id=$3', 
            [whatsappResult.textMessageId || whatsappResult.pdfMessageId, ticket?.ticketId, updatedBooking.id]);
        } else {
          await db.query('UPDATE bookings SET status = $1, whatsapp_sent = false, whatsapp_message_id = $2, confirmation_error = $3, updated_at = now() WHERE id=$4', 
            ['confirmation_failed', 'FAILED-' + Date.now(), JSON.stringify(whatsappResult.details || whatsappResult.error), updatedBooking.id]);
          
          return res.status(502).json({ 
            success: false, 
            message: 'Failed to send ticket via WhatsApp', 
            error: whatsappResult.error,
            bookingId: updatedBooking.booking_string_id || updatedBooking.id
          });
        }
      } else {
        whatsappResult = { success: false, error: 'Invalid phone number' };
        if (ticket?.ticketId) {
          await db.query('UPDATE bookings SET ticket_id = $1, whatsapp_sent = false, whatsapp_message_id = $2, updated_at = now() WHERE id=$3', 
            [ticket.ticketId, 'NO_PHONE-' + Date.now(), updatedBooking.id]);
        }
      }
    } catch (e) {
      console.error('❌ WhatsApp send error:', e);
      whatsappResult = { success: false, error: e.message };
      if (ticket?.ticketId) {
        await db.query('UPDATE bookings SET ticket_id = $1, whatsapp_sent = true, whatsapp_message_id = $2, updated_at = now() WHERE id=$3', 
          [ticket.ticketId, 'EXCEPTION-' + Date.now(), updatedBooking.id]);
      }
    }

    // Emit real-time update with minimal logging
    try {
      if (io) {
        io.emit('booking:confirmed', { 
          seatId: updatedBooking.seat, 
          status: 'paid',
          bookingId: updatedBooking.booking_string_id || updatedBooking.id,
          ticketId: ticket?.ticketId,
          fullName: ticket?.fullName
        });
        
        io.emit('bookingUpdated', {
          id: updatedBooking.id,
          status: 'paid',
          ticketId: ticket?.ticketId,
          whatsappSent: whatsappResult?.success || false
        });
      }
    } catch (e) {
      console.error('❌ Socket emit error', e);
    }

    return res.json({
      success: true,
      message: 'Оплата подтверждена и билет отправлен в WhatsApp',
      ticketId: ticket?.ticketId || null,
      ticketPath: publicPdfUrl || (ticket?.path) || null,
      whatsappResult: whatsappResult
    });

  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

// ============================================================================
// OPTIMIZED USER PAYMENT CONFIRMATION SECTION
// ============================================================================

app.post('/api/user-payment-confirm', async (req, res) => {
  const { seatId, phone, studentName } = req.body;
  
  if (!seatId || !phone || !studentName) {
    return res.status(400).json({ 
      success: false, 
      message: 'seatId, studentName, and phone are required' 
    });
  }

  try {
    const [table, seat] = seatId.split('-').map(Number);
    
    if (isNaN(table) || isNaN(seat)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid seatId format. Expected: table-seat' 
      });
    }

    // Check if seat is already booked
    const existingBooking = await db.query(
      'SELECT * FROM bookings WHERE table_number = $1 AND seat_number = $2 AND status IN ($3, $4)',
      [table, seat, 'pending', 'paid']
    );

    if (existingBooking.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'This seat is already booked' 
      });
    }

    // Create booking
    const bookingId = 'BKM' + Date.now().toString(36).toUpperCase();
    const result = await db.query(
      'INSERT INTO bookings (id, booking_string_id, first_name, last_name, user_phone, table_number, seat_number, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now()) RETURNING *',
      [bookingId, bookingId, studentName.split(' ')[0] || studentName, studentName.split(' ')[1] || '', phone, table, seat, 'pending']
    );

    const booking = result.rows[0];

    // Emit real-time updates with minimal logging
    try {
      if (io) {
        io.emit('update-seat-status', {
          type: 'booking-created',
          data: {
            bookingId: bookingId,
            table: table,
            seat: seat,
            status: 'pending',
            firstName: studentName.split(' ')[0] || studentName,
            lastName: studentName.split(' ')[1] || ''
          },
          timestamp: Date.now()
        });

        const seatId = `${table}-${seat}`;
        io.emit('update-seat-status', {
          seatId: seatId,
          status: 'pending',
          timestamp: Date.now()
        });

        io.emit('bookingUpdated', booking);
      }
    } catch (e) {
      console.error('❌ Socket emit error', e);
    }

    return res.json({
      success: true,
      message: 'Оплата подтверждена. Ожидайте подтверждения администратора.',
      bookingId: bookingId,
      status: 'pending'
    });

  } catch (error) {
    console.error('❌ Error confirming user payment:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error', 
      error: error.message 
    });
  }
});

// ============================================================================
// OPTIMIZED SOCKET.IO CONFIGURATION
// ============================================================================

// Configure Socket.IO with optimized settings for Railway
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    // Reduce logging for Railway
    logLevel: 'error'
});

// Socket.IO connection handling with minimal logging
io.on('connection', (socket) => {
  // Only log critical events
  socket.on('disconnect', (reason) => {
    if (reason === 'client namespace disconnect') {
      // Only log unexpected disconnections
    }
  });
});

// ============================================================================
// OPTIMIZED HEALTH ENDPOINTS
// ============================================================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'golden-middle-booking'
  });
});

app.get('/api/health/greenapi', async (req, res) => {
  try {
    const response = await axios.get(`${GREEN_API_BASE}/waInstance${ID_INSTANCE}/getStateInstance/${API_TOKEN}`, {
      timeout: 5000
    });
    
    res.json({
      status: 'ok',
      greenApi: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'Green API not available',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// OPTIMIZED STATIC FILE SERVING
// ============================================================================

// Serve ticket files with proper headers
app.use('/tickets', express.static(path.join(__dirname, '..', 'tickets'), {
  setHeaders: (res, path) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

// Serve temp tickets
app.use('/temp-tickets', express.static(path.join(os.tmpdir()), {
  setHeaders: (res, path) => {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));
