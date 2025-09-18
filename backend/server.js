const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const app = express();
const server = createServer(app);

// Configure Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: false
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/healthz', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Green API health check
app.get('/health/greenapi', async (req, res) => {
    try {
        const GREEN_API_BASE = process.env.GREEN_API_BASE || 'https://7105.api.greenapi.com';
        const ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE || '7105317460';
        const API_TOKEN = process.env.GREEN_API_TOKEN || '76de4f547a564df4a3092b41aeacfd7ad0e848b3506d42a1b9';
        
        console.log(' Checking Green API health...');
        const response = await axios.get(`${GREEN_API_BASE}/waInstance${ID_INSTANCE}/getStateInstance/${API_TOKEN}`, {
            timeout: 10000
        });
        
        console.log(' Green API health check response:', response.data);
        res.json({ 
            green: response.data.stateInstance || 'unknown',
            timestamp: new Date().toISOString(),
            status: 'ok'
        });
    } catch (error) {
        console.error(' Green API health check failed:', error.message);
        res.status(503).json({ 
            green: 'error',
            error: error.message,
            timestamp: new Date().toISOString(),
            status: 'error'
        });
    }
});

// Basic booking endpoints
app.post('/api/user-payment-confirm', async (req, res) => {
    const { seatId, studentName, phone } = req.body;
    console.log(' User payment confirmation request:', {
        seatId,
        studentName,
        phone,
        timestamp: new Date().toISOString()
    });

    if (!seatId || !studentName || !phone) {
        return res.status(400).json({ error: 'seatId, studentName, and phone are required' });
    }

    // Generate booking ID
    const bookingId = 'BKM' + Math.random().toString(36).substr(2, 9).toUpperCase();

    res.json({
        success: true,
        message: 'Оплата подтверждена. Ожидайте подтверждения администратора.',
        bookingId: bookingId,
        status: 'pending'
    });
});

app.post('/api/admin/confirm-payment', async (req, res) => {
    const { bookingId } = req.body;
    console.log(' Admin payment confirmation request:', {
        bookingId,
        timestamp: new Date().toISOString()
    });

    if (!bookingId) {
        return res.status(400).json({ error: 'bookingId required' });
    }

    res.json({
        success: true,
        message: 'Оплата подтверждена и билет отправлен в WhatsApp',
        ticketId: 'TMF' + Math.random().toString(36).substr(2, 8).toUpperCase(),
        ticketPath: '/tickets/sample.pdf'
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(' Client connected:', socket.id);
    
    socket.on('disconnect', (reason) => {
        console.log(' Client disconnected:', socket.id, 'Reason:', reason);
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log(` Server running on port ${PORT}`);
    console.log(` Health check: http://localhost:${PORT}/health`);
    console.log(` Green API health: http://localhost:${PORT}/health/greenapi`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log(' SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log(' Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log(' SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log(' Server closed');
        process.exit(0);
    });
});
