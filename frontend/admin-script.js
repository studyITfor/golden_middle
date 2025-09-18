// Admin Panel System
class AdminPanel {
    constructor() {
        this.adminPassword = 'admin123'; // Change this in production
        this.bookings = {};
        this.currentBooking = null;
        this.prebookedSeats = new Set();
        this.selectedSeats = new Set(); // For manual seat selection
        this.zoomLevel = 100; // Current zoom level
        this.zoomLevels = [50, 75, 100, 125, 150, 200]; // Available zoom levels
        this.socket = null;
        
        // Pan/zoom state variables
        this.hall = null; // Will be set to .hall-layout-curved element
        this.scale = 1;
        this.minScale = 0.6;
        this.maxScale = 2.0;
        this.lastDistance = null;
        this.translateX = 0;
        this.translateY = 0;
        this.startPanX = 0;
        this.startPanY = 0;
        this.isPanning = false;
        this.isPinching = false;
        this.lastTouchTime = 0;
        this.ignoreTapUntil = 0;
        
        // Ticket verification stats
        this.verificationStats = {
            verifiedToday: 0,
            validTickets: 0,
            invalidTickets: 0
        };
        
        this.init();
    }

    // Utility functions for pan/zoom
    clamp(v, a, b) {
        return Math.max(a, Math.min(b, v));
    }

    getBounds() {
        const container = this.hall.parentElement.getBoundingClientRect();
        const content = this.hall.getBoundingClientRect();
        const scaledWidth = (content.width) * this.scale;
        const scaledHeight = (content.height) * this.scale;
        // Compute min/max translate so hall does not go out of container
        const minX = Math.min(0, container.width - scaledWidth);
        const minY = Math.min(0, container.height - scaledHeight);
        const maxX = 0;
        const maxY = 0;
        return { minX, maxX, minY, maxY };
    }

    constrainToBounds() {
        const bounds = this.getBounds();
        this.translateX = this.clamp(this.translateX, bounds.minX, bounds.maxX);
        this.translateY = this.clamp(this.translateY, bounds.minY, bounds.maxY);
    }

    applyMomentum(velocityX, velocityY) {
        const friction = 0.95; // Momentum decay factor
        const minVelocity = 0.1;
        
        const animate = () => {
            if (Math.abs(velocityX) < minVelocity && Math.abs(velocityY) < minVelocity) {
                return; // Stop animation
            }
            
            this.translateX += velocityX;
            this.translateY += velocityY;
            
            this.constrainToBounds();
            this.applyTransform();
            
            velocityX *= friction;
            velocityY *= friction;
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }

    applyTransform() {
        this.hall.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }

    getDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    getMidpoint(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    }

    setupTouchEvents() {
        if (!this.hall) {
            console.warn('Hall element not found for touch events');
            return;
        }

        console.log('Setting up touch events for hall element:', this.hall);

        // Ticket.kg style pan/zoom implementation
        let touchStartTime = 0;
        let touchStartX = 0;
        let touchStartY = 0;
        let hasMoved = false;
        let touchMoveThreshold = 3; // pixels - very responsive panning like Ticket.kg
        let lastPanTime = 0;
        let velocityX = 0;
        let velocityY = 0;
        let lastPanX = 0;
        let lastPanY = 0;
        let isDragging = false;

        // Mouse/trackpad support for desktop
        let mouseDown = false;
        let mouseStartX = 0;
        let mouseStartY = 0;
        let lastMouseX = 0;
        let lastMouseY = 0;

        // Touch events
        this.hall.addEventListener('touchstart', (e) => {
            console.log('Touch start:', e.touches.length, 'touches');
            this.lastTouchTime = Date.now();
            touchStartTime = Date.now();
            hasMoved = false;
            isDragging = false;
            
            if (e.touches.length === 2) {
                this.isPinching = true;
                this.lastDistance = this.getDistance(e.touches);
                // Set transform origin to pinch center for smooth zoom
                const mid = this.getMidpoint(e.touches);
                const rect = this.hall.getBoundingClientRect();
                this.hall.style.transformOrigin = `${mid.x - rect.left}px ${mid.y - rect.top}px`;
                this.hall.classList.add('zooming');
                console.log('Pinch gesture started');
                e.preventDefault();
            } else if (e.touches.length === 1) {
                this.isPanning = true;
                this.startPanX = e.touches[0].clientX - this.translateX;
                this.startPanY = e.touches[0].clientY - this.translateY;
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                lastPanX = e.touches[0].clientX;
                lastPanY = e.touches[0].clientY;
                lastPanTime = Date.now();
                this.hall.classList.add('panning');
                console.log('Pan gesture started');
            }
        }, { passive: false });

        this.hall.addEventListener('touchmove', (e) => {
            if (this.isPinching && e.touches.length === 2) {
                const dist = this.getDistance(e.touches);
                const delta = dist - this.lastDistance;
                const sensitivity = 0.003; // Optimized zoom sensitivity for better control
                const oldScale = this.scale;
                this.scale = this.clamp(this.scale + delta * sensitivity, this.minScale, this.maxScale);

                // Zoom centered on pinch point
                const mid = this.getMidpoint(e.touches);
                const rect = this.hall.getBoundingClientRect();
                const cx = mid.x - rect.left;
                const cy = mid.y - rect.top;
                
                // Keep pinch point stable during zoom
                this.translateX = (this.translateX - cx) * (this.scale / oldScale) + cx;
                this.translateY = (this.translateY - cy) * (this.scale / oldScale) + cy;

                this.lastDistance = dist;
                this.constrainToBounds();
                requestAnimationFrame(() => this.applyTransform());
                console.log('Pinch zoom:', this.scale.toFixed(2));
                e.preventDefault();
            } else if (this.isPanning && e.touches.length === 1 && !this.isPinching) {
                const currentX = e.touches[0].clientX;
                const currentY = e.touches[0].clientY;
                const deltaX = Math.abs(currentX - touchStartX);
                const deltaY = Math.abs(currentY - touchStartY);
                
                if (deltaX > touchMoveThreshold || deltaY > touchMoveThreshold) {
                    hasMoved = true;
                    isDragging = true;
                    console.log('Pan movement detected');
                }
                
                // Calculate velocity for momentum
                const now = Date.now();
                const timeDelta = now - lastPanTime;
                if (timeDelta > 0) {
                    velocityX = (currentX - lastPanX) / timeDelta;
                    velocityY = (currentY - lastPanY) / timeDelta;
                }
                
                this.translateX = currentX - this.startPanX;
                this.translateY = currentY - this.startPanY;
                
                this.constrainToBounds();
                requestAnimationFrame(() => this.applyTransform());
                
                lastPanX = currentX;
                lastPanY = currentY;
                lastPanTime = now;
                e.preventDefault();
            }
        }, { passive: false });

        this.hall.addEventListener('touchend', (e) => {
            const touchDuration = Date.now() - touchStartTime;
            
            if (e.touches.length < 2) { 
                this.isPinching = false; 
                this.lastDistance = null;
                this.hall.classList.remove('zooming');
            }
            if (e.touches.length === 0) { 
                this.isPanning = false; 
                this.hall.classList.remove('panning');
                
                // Apply momentum if dragging
                if (isDragging && Math.abs(velocityX) > 0.1 || Math.abs(velocityY) > 0.1) {
                    this.applyMomentum(velocityX, velocityY);
                }
            }
            
            // Set cooldown based on gesture type
            if (this.isPinching || hasMoved) {
                this.ignoreTapUntil = Date.now() + 250;
            } else if (touchDuration < 150) {
                this.ignoreTapUntil = Date.now() + 50;
            } else {
                this.ignoreTapUntil = Date.now() + 150;
            }
            
            isDragging = false;
        });

        // Mouse events for desktop
        this.hall.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                mouseDown = true;
                mouseStartX = e.clientX - this.translateX;
                mouseStartY = e.clientY - this.translateY;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                this.hall.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        this.hall.addEventListener('mousemove', (e) => {
            if (mouseDown) {
                this.translateX = e.clientX - mouseStartX;
                this.translateY = e.clientY - mouseStartY;
                this.constrainToBounds();
                requestAnimationFrame(() => this.applyTransform());
                e.preventDefault();
            }
        });

        this.hall.addEventListener('mouseup', (e) => {
            if (mouseDown) {
                mouseDown = false;
                this.hall.style.cursor = 'grab';
                this.ignoreTapUntil = Date.now() + 100;
            }
        });

        // Wheel zoom for desktop
        this.hall.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.hall.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const oldScale = this.scale;
            this.scale = this.clamp(this.scale * zoomFactor, this.minScale, this.maxScale);
            
            // Zoom centered on mouse position
            this.translateX = (this.translateX - mouseX) * (this.scale / oldScale) + mouseX;
            this.translateY = (this.translateY - mouseY) * (this.scale / oldScale) + mouseY;
            
            this.constrainToBounds();
            requestAnimationFrame(() => this.applyTransform());
        }, { passive: false });

        // Enhanced click/tap handler
        this.hall.addEventListener('click', (e) => this.seatClickHandler(e));
        this.hall.addEventListener('touchend', (e) => {
            if (!hasMoved && !this.isPinching && !isDragging) {
                this.seatClickHandler(e);
            }
        }, { passive: false });
    }

    seatClickHandler(e) {
        const now = Date.now();
        if (now < this.ignoreTapUntil) {
            // ignore accidental taps during/shortly after a gesture
            console.log('Seat click ignored due to gesture cooldown');
            e.preventDefault();
            return;
        }
        
        const seatEl = e.target.closest('.seat-curved');
        if (!seatEl) {
            console.log('No seat element found for click');
            return;
        }
        
        const seatId = seatEl.dataset.seatId;
        console.log('Seat clicked:', seatId);
        
        // Prefer authoritative status from data-* attribute that the server controls
        const status = seatEl.dataset.status || seatEl.getAttribute('data-status') || 
                     (seatEl.classList.contains('booked') ? 'booked' : 'active');
        
        console.log('Seat status:', status);
        
        if (status === 'booked' || status === 'paid' || status === 'reserved' || status === 'pending') {
            // show an "already booked/paid" modal. Do NOT open booking form.
            console.log('Seat is not available, showing unavailable modal');
            this.showAlreadyBookedModal(seatEl);
            e.preventDefault();
            return;
        }
        
        console.log('Seat is available, showing seat info');
        this.showSeatInfo(seatId);
    }

    showAlreadyBookedModal(seatEl) {
        const seatId = seatEl.dataset.seatId;
        const [table, seat] = seatId.split('-');
        const seatStatus = seatEl.dataset.status;
        const booking = Object.values(this.bookings).find(b => 
            b.table == table && b.seat == seat && b.status !== 'cancelled'
        );
        
        let status = 'Забронировано';
        let message = 'Это место недоступно для бронирования.';
        
        // Check seat status first, then booking details
        if (seatStatus === 'reserved' || seatStatus === 'paid') {
            status = seatStatus === 'paid' ? 'Оплачено' : 'Зарезервировано';
            message = 'Это место недоступно для бронирования.';
        } else if (seatStatus === 'booked') {
            status = 'Забронировано';
            message = 'Это место недоступно для бронирования.';
        } else if (booking) {
            status = this.getStatusText(booking.status);
            if (booking.status === 'pending') {
                message = 'Это место забронировано, но еще не оплачено.';
            } else if (booking.status === 'paid' || booking.status === 'confirmed') {
                message = `Это место забронировано и оплачено пользователем ${booking.firstName} ${booking.lastName}.`;
            } else {
                message = 'Это место недоступно для бронирования.';
            }
        }
        
        // Create and show modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Место ${table}-${seat}</h3>
                <p><strong>Статус:</strong> ${status}</p>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="this.closest('.modal').remove()">ОК</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 5000);
    }

    init() {
        this.setupEventListeners();
        this.loadBookings();
        this.loadData();
        this.updateStatistics();
        this.generateHallPreview();
        // Initialize Socket.IO connection for real-time updates
        this.initializeSocket();
        // Setup real-time updates with Socket.IO and polling fallback
        this.setupRealtimeUpdates();
        // Initialize seating plan image zoom functionality
        this.initializeSeatingPlanImage();
    }

    setupEventListeners() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Admin controls
        document.getElementById('prebookSeats').addEventListener('click', () => {
            this.prebookRandomSeats();
        });

        document.getElementById('clearPrebooked').addEventListener('click', () => {
            this.clearPrebookedSeats();
        });

        document.getElementById('refreshData').addEventListener('click', () => {
            this.loadBookings();
            this.updateStatistics();
        });

        document.getElementById('refreshHall').addEventListener('click', () => {
            this.generateHallPreview();
        });

        document.getElementById('manualReserve').addEventListener('click', () => {
            this.startManualReservation();
        });

        document.getElementById('manualRelease').addEventListener('click', () => {
            this.startManualRelease();
        });

        document.getElementById('releaseAllSeats').addEventListener('click', () => {
            this.releaseAllSeats();
        });

        // Seat selection controls
        document.getElementById('addSeatsFromInput').addEventListener('click', () => {
            this.addSeatsFromInput();
        });

        document.getElementById('clearSelection').addEventListener('click', () => {
            this.clearSeatSelection();
        });

        document.getElementById('prebookSelected').addEventListener('click', () => {
            this.prebookSelectedSeats();
        });

        document.getElementById('prebookSelectedSeats').addEventListener('click', () => {
            this.prebookSelectedSeats();
        });

        // Pre-booked seats controls
        document.getElementById('clearAllPrebooked').addEventListener('click', () => {
            this.clearAllPrebookedSeats();
        });

        document.getElementById('refreshPrebooked').addEventListener('click', () => {
            this.refreshPrebookedSeats();
        });

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', () => {
            this.zoomIn();
        });

        document.getElementById('zoomOut').addEventListener('click', () => {
            this.zoomOut();
        });

        document.getElementById('zoomReset').addEventListener('click', () => {
            this.zoomReset();
        });

        // Ticket verification
        document.getElementById('verifyTicket').addEventListener('click', () => {
            this.verifyTicket();
        });

        document.getElementById('ticketInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.verifyTicket();
            }
        });

        document.getElementById('refreshVerification').addEventListener('click', () => {
            this.refreshVerificationStats();
        });

        document.getElementById('addTicketManually').addEventListener('click', () => {
            this.showModal('addTicketModal');
        });

        document.getElementById('closeAddTicketModal').addEventListener('click', () => {
            this.hideModal('addTicketModal');
        });

        document.getElementById('cancelAddTicket').addEventListener('click', () => {
            this.hideModal('addTicketModal');
        });

        document.getElementById('addTicketForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addTicketManually();
        });

        // Search and filter
        document.getElementById('searchBookings').addEventListener('input', (e) => {
            this.filterBookings();
        });

        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.filterBookings();
        });

        // Modal controls
        document.getElementById('closePaymentModal').addEventListener('click', () => {
            this.hideModal('paymentModal');
        });

        document.getElementById('closeTicketModal').addEventListener('click', () => {
            this.hideModal('ticketModal');
        });

        // Payment actions
        document.getElementById('confirmPayment').addEventListener('click', () => {
            this.confirmPayment();
        });

        document.getElementById('cancelBooking').addEventListener('click', () => {
            this.cancelBooking();
        });

        // Bulk actions
        document.getElementById('bulkConfirmBtn').addEventListener('click', () => {
            this.bulkConfirmPayments();
        });

        document.getElementById('sendPendingTicketsBtn').addEventListener('click', () => {
            this.sendPendingTickets();
        });

        // Ticket actions
        document.getElementById('sendTicket').addEventListener('click', () => {
            this.sendTicket();
        });

        document.getElementById('downloadTicket').addEventListener('click', () => {
            this.downloadTicket();
        });

        // Close modals on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    handleLogin() {
        const password = document.getElementById('adminPassword').value;
        const errorDiv = document.getElementById('loginError');

        if (password === this.adminPassword) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'block';
            this.loadBookings();
            this.updateStatistics();
        } else {
            errorDiv.style.display = 'flex';
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 3000);
        }
    }

    logout() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('adminPassword').value = '';
    }

    async loadBookings() {
        try {
            // Load bookings from the database via the seat statuses endpoint
            const response = await fetch('/api/seat-statuses');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            // Initialize empty bookings object
            this.bookings = {};
            
            // Load bookings from the database
            const bookingsResponse = await fetch('/api/bookings');
            if (bookingsResponse.ok) {
                const bookingsData = await bookingsResponse.json();
                if (Array.isArray(bookingsData)) {
                    bookingsData.forEach(booking => {
                        this.bookings[booking.booking_string_id || booking.id] = booking;
                    });
                }
            }
            
            this.renderBookingsTable();
            this.renderPrebookedTable();
            this.updatePrebookedStats();
        } catch (error) {
            console.error('Error loading bookings:', error);
            // Fallback to empty object if server is unavailable
            this.bookings = {};
            this.renderBookingsTable();
            this.renderPrebookedTable();
            this.updatePrebookedStats();
        }
    }

    // Setup Socket.IO connection and polling fallback
    setupRealtimeUpdates() {
        // Connect to Socket.IO
        this.socket = io();
        
        // Handle connection events
        this.socket.on('connect', () => {
            console.log('🔌 Admin panel connected to server');
            // Join admin room for admin-specific updates
            this.socket.emit('join-admin-room');
        });
        
        this.socket.on('disconnect', () => {
            console.log('🔌 Admin panel disconnected from server');
        });
        
        // Handle real-time seat status updates
        this.socket.on('update-seat-status', (data) => {
            console.log('📡 Received seat status update:', data);
            
            if (data.type === 'booking-created') {
                // Refresh bookings when new booking is created
                this.loadBookings();
            } else if (data.type === 'payment-confirmed') {
                // Refresh bookings when payment is confirmed
                this.loadBookings();
                // Show success notification
                this.showNotification('Payment confirmed and ticket sent!', 'success');
            } else if (data.type === 'booking-deleted') {
                // Refresh bookings when booking is deleted
                this.loadBookings();
                // Show success notification
                this.showNotification('Booking deleted successfully!', 'success');
            } else if (data.seatId) {
                // Handle individual seat status updates
                this.updateSeatStatus(data.seatId, data.status);
            }
        });
        
        // Handle booking updates (from payment confirmation)
        this.socket.on('bookingUpdated', (booking) => {
            console.log('📡 Received booking update:', booking);
            // Refresh bookings to show updated status
            this.loadBookings();
            // Show notification
            this.showNotification(`Booking ${booking.booking_string_id || booking.id} confirmed!`, 'success');
        });
        
        // Handle booking deletions
        this.socket.on('bookingDeleted', (seatId) => {
            console.log('📡 Received booking deletion:', seatId);
            // Refresh bookings and update seat status
            this.loadBookings();
            this.updateSeatStatus(seatId, 'available');
            this.showNotification('Booking deleted successfully!', 'success');
        });
        
        // Handle admin room events
        this.socket.on('admin-update', (data) => {
            console.log('📡 Received admin update:', data);
            this.loadBookings();
        });
        
        // Request initial seat data
        this.socket.emit('requestSeatData');
        
        // Handle seat data updates
        this.socket.on('seatData', (data) => {
            console.log('Received seat data via Socket.IO:', data);
            this.bookings = {};
            data.forEach(booking => {
                this.bookings[booking.id] = booking;
            });
            this.renderBookingsTable();
            this.renderPrebookedTable();
            this.updatePrebookedStats();
        });
        
        // Handle seat updates
        this.socket.on('seatUpdate', (data) => {
            console.log('Received seat update via Socket.IO:', data);
            // Update seat statuses in real-time
        });
        
        // Handle disconnection
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server, starting polling fallback');
            this.startPollingFallback();
        });
        
        // Start polling fallback as backup
        this.startPollingFallback();
    }
    
    startPollingFallback() {
        // Poll every 5 seconds if socket is disconnected
        setInterval(() => {
            if (!this.socket || !this.socket.connected) {
                console.log('Socket disconnected, polling for updates...');
                this.loadBookings();
            }
        }, 5000);
    }

    renderBookingsTable() {
        const tbody = document.getElementById('bookingsTableBody');
        tbody.innerHTML = '';

        const bookings = Object.values(this.bookings);
        const filteredBookings = this.getFilteredBookings(bookings);

        filteredBookings.forEach(booking => {
            const row = document.createElement('tr');
            const bookingId = booking.booking_string_id || booking.id || 'N/A';
            const phone = booking.phone || booking.user_phone || 'N/A';
            const firstName = booking.first_name || booking.firstName || 'N/A';
            const lastName = booking.last_name || booking.lastName || 'N/A';
            const tableNumber = booking.table_number || booking.table || 'N/A';
            const seatNumber = booking.seat_number || booking.seat || 'N/A';
            const status = booking.status || 'pending';
            const createdDate = booking.created_at || booking.bookingDate || new Date().toISOString();
            
            row.innerHTML = `
                <td>${bookingId}</td>
                <td>${firstName} ${lastName}</td>
                <td>${phone}</td>
                <td>-</td>
                <td>Стол ${tableNumber}, Место ${seatNumber}</td>
                <td><span class="status-badge status-${status}">${this.getStatusText(status)}</span></td>
                <td>${new Date(createdDate).toLocaleDateString('ru-RU')}</td>
                <td>
                    <div class="action-buttons">
                        ${status === 'pending' ? `
                            <button class="btn btn-success" onclick="adminPanel.confirmPayment('${bookingId}')">
                                <i class="fas fa-check"></i> Подтвердить оплату
                            </button>
                        ` : ''}
                        ${status === 'paid' || status === 'confirmed' ? `
                            <button class="btn btn-primary" onclick="adminPanel.generateTicket('${bookingId}')">
                                <i class="fas fa-ticket-alt"></i> Билет
                            </button>
                            <button class="btn btn-info" onclick="adminPanel.resendTicket('${bookingId}')">
                                <i class="fas fa-paper-plane"></i> Переотправить билет
                            </button>
                        ` : ''}
                        <button class="btn btn-danger" onclick="adminPanel.deleteBooking('${bookingId}')">
                            <i class="fas fa-trash"></i> Удалить
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    getFilteredBookings(bookings) {
        const searchTerm = document.getElementById('searchBookings').value.toLowerCase();
        const statusFilter = document.getElementById('statusFilter').value;

        return bookings.filter(booking => {
            const firstName = (booking.first_name || booking.firstName || '').toLowerCase();
            const lastName = (booking.last_name || booking.lastName || '').toLowerCase();
            const phone = (booking.phone || booking.user_phone || '').toLowerCase();
            const status = booking.status || 'pending';
            
            const matchesSearch = !searchTerm || 
                firstName.includes(searchTerm) ||
                lastName.includes(searchTerm) ||
                phone.includes(searchTerm) ||
                (booking.booking_string_id || booking.id || '').toLowerCase().includes(searchTerm);

            const matchesStatus = statusFilter === 'all' || status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }

    filterBookings() {
        this.renderBookingsTable();
    }

    getStatusText(status) {
        const statusMap = {
            'pending': 'Ожидает оплаты',
            'reserved': 'Зарезервировано',
            'paid': 'Оплачено',
            'confirmed': 'Подтверждено',
            'prebooked': 'Предварительно забронировано',
            'cancelled': 'Отменено'
        };
        return statusMap[status] || status;
    }

    showPaymentModal(bookingId) {
        this.currentBooking = this.bookings[bookingId];
        if (!this.currentBooking) return;

        const detailsDiv = document.getElementById('paymentBookingDetails');
        detailsDiv.innerHTML = `
            <h4>Детали бронирования</h4>
            <div class="detail-row">
                <span class="label">Имя:</span>
                <span class="value">${this.currentBooking.firstName} ${this.currentBooking.lastName}</span>
            </div>
            <div class="detail-row">
                <span class="label">Телефон:</span>
                <span class="value">${this.currentBooking.phone}</span>
            </div>
            <div class="detail-row">
                <span class="label">Email:</span>
                <span class="value">${this.currentBooking.email}</span>
            </div>
            <div class="detail-row">
                <span class="label">Место:</span>
                <span class="value">Стол ${this.currentBooking.table}, Место ${this.currentBooking.seat}</span>
            </div>
            <div class="detail-row">
                <span class="label">Сумма:</span>
                <span class="value">${this.currentBooking.price.toLocaleString()} Сом</span>
            </div>
            <div class="detail-row">
                <span class="label">Дата бронирования:</span>
                <span class="value">${new Date(this.currentBooking.bookingDate).toLocaleString('ru-RU')}</span>
            </div>
        `;

        this.showModal('paymentModal');
    }

    async confirmPayment(bookingId) {
        if (!this.bookings[bookingId]) return;

        const booking = this.bookings[bookingId];
        if (confirm(`Confirm Payment для ${booking.firstName} ${booking.lastName} (Table ${booking.table}, Seat ${booking.seat})?\n\nЭто действие сгенерирует и отправит билет студенту в WhatsApp.`)) {
            try {
                // Show loading state
                const confirmButton = document.querySelector(`button[onclick="adminPanel.confirmPayment('${bookingId}')"]`);
                if (confirmButton) {
                    confirmButton.disabled = true;
                    confirmButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обработка...';
                }

                // Call backend API
                const response = await fetch('/api/confirm-payment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ bookingId: bookingId })
                });

                const result = await response.json();

                if (result.success) {
                    // Update local booking data
                    booking.status = 'Paid';
                    booking.paymentDate = new Date().toISOString();
                    booking.paymentConfirmedBy = 'admin';
                    booking.ticketId = result.ticketId;
                    
                    this.bookings[bookingId] = booking;
                    this.saveBookings();
                    
                    // Update UI
                    this.renderBookingsTable();
                    this.updateStatistics();
                    this.generateHallPreview();
                    
                    // Show success message
                    alert(`✅ Оплата подтверждена для ${booking.firstName} ${booking.lastName}!\n\n📱 Ticket отправлен в WhatsApp: ${booking.phone}\n🎫 ID билета: ${result.ticketId}\n\nSeat Table ${booking.table}, Seat ${booking.seat} теперь забронировано.`);
                } else {
                    throw new Error(result.error || 'Ошибка при подтверждении оплаты');
                }
            } catch (error) {
                console.error('Error confirming payment:', error);
                alert(`❌ Ошибка при подтверждении оплаты: ${error.message}`);
            } finally {
                // Reset button state
                const confirmButton = document.querySelector(`button[onclick="adminPanel.confirmPayment('${bookingId}')"]`);
                if (confirmButton) {
                    confirmButton.disabled = false;
                    confirmButton.innerHTML = '<i class="fas fa-check"></i> Confirm Payment';
                }
            }
        }
    }

    async bulkConfirmPayments() {
        if (confirm('Подтвердить все ожидающие бронирования?\n\nЭто действие:\n• Обновит статус всех "Ожидает подтверждения" на "Забронировано (оплачено)"\n• Сгенерирует и отправит билеты в WhatsApp\n• Может занять несколько минут\n\nПродолжить?')) {
            try {
                // Show loading state
                const bulkBtn = document.getElementById('bulkConfirmBtn');
                const originalText = bulkBtn.innerHTML;
                bulkBtn.disabled = true;
                bulkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Обработка...';

                // Call bulk confirmation API
                const response = await fetch('/api/bulk-confirm-payments', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                const result = await response.json();

                if (result.success) {
                    // Refresh data
                    await this.loadBookings();
                    this.renderBookingsTable();
                    this.updateStatistics();
                    this.generateHallPreview();
                    
                    // Show success message
                    alert(`✅ Массовое подтверждение завершено!\n\n📋 Обработано: ${result.processed}\n✅ Успешно: ${result.successful}\n❌ Ошибок: ${result.failed}\n\n📱 Билеты отправлены в WhatsApp`);
                } else {
                    throw new Error(result.message || 'Ошибка при массовом подтверждении');
                }
            } catch (error) {
                console.error('Error in bulk confirmation:', error);
                alert(`❌ Ошибка при массовом подтверждении: ${error.message}`);
            } finally {
                // Reset button state
                const bulkBtn = document.getElementById('bulkConfirmBtn');
                bulkBtn.disabled = false;
                bulkBtn.innerHTML = '<i class="fas fa-check-double"></i> Подтвердить все';
            }
        }
    }

    async sendPendingTickets() {
        if (confirm('Отправить билеты для всех подтвержденных бронирований?\n\nЭто действие отправит WhatsApp билеты для всех бронирований со статусом "Забронировано (оплачено)", у которых еще не отправлены билеты.\n\nПродолжить?')) {
            try {
                // Show loading state
                const sendBtn = document.getElementById('sendPendingTicketsBtn');
                const originalText = sendBtn.innerHTML;
                sendBtn.disabled = true;
                sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Отправка...';

                // Call send pending tickets API
                const response = await fetch('/api/send-pending-tickets', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                const result = await response.json();

                if (result.success) {
                    // Refresh data
                    await this.loadBookings();
                    this.renderBookingsTable();
                    this.updateStatistics();
                    
                    // Show success message
                    alert(`✅ Отправка билетов завершена!\n\n📋 Обработано: ${result.processed}\n✅ Успешно: ${result.successful}\n❌ Ошибок: ${result.failed}\n\n📱 Билеты отправлены в WhatsApp`);
                } else {
                    throw new Error(result.message || 'Ошибка при отправке билетов');
                }
            } catch (error) {
                console.error('Error sending pending tickets:', error);
                alert(`❌ Ошибка при отправке билетов: ${error.message}`);
            } finally {
                // Reset button state
                const sendBtn = document.getElementById('sendPendingTicketsBtn');
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Отправить билеты';
            }
        }
    }

    async generateTicket(bookingId) {
        try {
            console.log('🎫 Generating ticket for booking:', bookingId);
            
            const booking = this.bookings[bookingId];
            if (!booking) {
                alert('Бронирование не найдено');
                return;
            }

            // Call the ticket generation endpoint
            const response = await fetch('/api/generate-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ bookingId })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Ticket generated successfully:', result);
                
                // Update the booking with ticket info
                if (this.bookings[bookingId]) {
                    this.bookings[bookingId].ticketId = result.ticketId;
                    this.bookings[bookingId].ticketPath = result.ticketPath;
                }
                
                // Open the ticket in a new tab
                if (result.ticketPath) {
                    const ticketUrl = `https://upbeat-compassion-production.up.railway.app${result.ticketPath}`;
                    window.open(ticketUrl, '_blank');
                }
                
                // Refresh the admin panel
                this.renderBookingsTable();
                
                alert('Билет сгенерирован и открыт в новой вкладке!');
            } else {
                console.error('❌ Ticket generation failed:', result.error);
                alert('Ошибка при генерации билета: ' + result.error);
            }
        } catch (error) {
            console.error('❌ Error generating ticket:', error);
            alert('Ошибка при генерации билета: ' + error.message);
        }
    }

    async resendTicket(bookingId) {
        try {
            console.log('📱 Resending ticket for booking:', bookingId);
            
            const booking = this.bookings[bookingId];
            if (!booking) {
                alert('Бронирование не найдено');
                return;
            }

            // Call the resend ticket endpoint
            const response = await fetch('/api/resend-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ bookingId })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Ticket resent successfully:', result);
                alert('Билет переотправлен в WhatsApp!');
            } else {
                console.error('❌ Ticket resend failed:', result.error);
                alert('Ошибка при переотправке билета: ' + result.error);
            }
        } catch (error) {
            console.error('❌ Error resending ticket:', error);
            alert('Ошибка при переотправке билета: ' + error.message);
        }
    }

    cancelBooking() {
        if (!this.currentBooking) return;

        if (confirm('Вы уверены, что хотите отменить это бронирование?')) {
            this.currentBooking.status = 'cancelled';
            this.bookings[this.currentBooking.id] = this.currentBooking;
            
            this.saveBookings();
            this.renderBookingsTable();
            this.updateStatistics();
            this.hideModal('paymentModal');
            
            alert('Бронирование отменено.');
        }
    }

    async resendTicket(bookingId) {
        const booking = this.bookings[bookingId];
        if (!booking) {
            alert('❌ Бронирование не найдено');
            return;
        }

        if (booking.status !== 'paid' && booking.status !== 'confirmed') {
            alert('❌ Билет можно переотправить только для оплаченных бронирований');
            return;
        }

        if (!confirm(`Переотправить билет для ${booking.first_name || booking.firstName} ${booking.last_name || booking.lastName}?\n\nТелефон: ${booking.user_phone || booking.phone}`)) {
            return;
        }

        try {
            const response = await fetch('/api/resend-ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    bookingId: bookingId
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showNotification(`✅ Билет переотправлен в WhatsApp!`, 'success');
                console.log('✅ Ticket resent successfully:', result);
            } else {
                throw new Error(result.message || 'Ошибка при переотправке билета');
            }
        } catch (error) {
            console.error('Error resending ticket:', error);
            this.showNotification(`❌ Ошибка при переотправке билета: ${error.message}`, 'error');
        }
    }

    generateTicket(bookingId) {
        this.currentBooking = this.bookings[bookingId];
        if (!this.currentBooking) return;

        const ticketId = 'TK' + Date.now().toString(36).toUpperCase();
        const qrData = this.generateQRData(ticketId, this.currentBooking);

        document.getElementById('ticketName').textContent = 
            `${this.currentBooking.firstName} ${this.currentBooking.lastName}`;
        document.getElementById('ticketSeat').textContent = 
            `Table ${this.currentBooking.table}, Seat ${this.currentBooking.seat}`;
        document.getElementById('ticketId').textContent = ticketId;

        // Generate QR code
        const qrContainer = document.getElementById('qrcode');
        qrContainer.innerHTML = '';
        QRCode.toCanvas(qrContainer, qrData, {
            width: 150,
            height: 150,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        this.showModal('ticketModal');
    }

    generateQRData(ticketId, booking) {
        return JSON.stringify({
            ticketId: ticketId,
            bookingId: booking.id,
            seatId: `${booking.table}-${booking.seat}`,
            event: 'Золотая середина',
            date: '2025-10-05',
            time: '19:00',
            venue: 'Университетский зал',
            name: `${booking.firstName} ${booking.lastName}`,
            timestamp: Date.now()
        });
    }

    sendTicket() {
        if (!this.currentBooking) return;

        // In a real application, this would send an email
        // For demo purposes, we'll just show a success message
        alert(`Ticket отправлен на email: ${this.currentBooking.email}`);
        
        // Mark ticket as sent
        this.currentBooking.ticketSent = true;
        this.currentBooking.ticketSentDate = new Date().toISOString();
        this.bookings[this.currentBooking.id] = this.currentBooking;
        this.saveBookings();
        
        this.hideModal('ticketModal');
    }

    downloadTicket() {
        if (!this.currentBooking) return;

        const ticketData = {
            event: 'Университетское мероприятие "Золотая середина"',
            name: `${this.currentBooking.firstName} ${this.currentBooking.lastName}`,
            seat: `Table ${this.currentBooking.table}, Seat ${this.currentBooking.seat}`,
            date: '5 октября 2025',
            time: '19:00',
            venue: 'Университетский зал',
            ticketId: document.getElementById('ticketId').textContent,
            bookingId: this.currentBooking.id
        };

        const dataStr = JSON.stringify(ticketData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `zolotaya-seredina-bilet-${this.currentBooking.id}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
    }

    async deleteBooking(bookingId) {
        if (!this.bookings[bookingId]) return;
        
        const booking = this.bookings[bookingId];
        const firstName = booking.first_name || booking.firstName || 'N/A';
        const lastName = booking.last_name || booking.lastName || 'N/A';
        const tableNumber = booking.table_number || booking.table || 'N/A';
        const seatNumber = booking.seat_number || booking.seat || 'N/A';
        
        if (confirm(`Delete бронирование для ${firstName} ${lastName} (Table ${tableNumber}, Seat ${seatNumber})?\n\nЭто действие освободит место и его можно будет забронировать заново.`)) {
            try {
                // Show loading state
                const deleteButton = document.querySelector(`button[onclick="adminPanel.deleteBooking('${bookingId}')"]`);
                if (deleteButton) {
                    deleteButton.disabled = true;
                    deleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Удаление...';
                }

                // Call backend API
                const response = await fetch(`/api/delete-booking/${bookingId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (result.success) {
                    // Store booking details for confirmation message
                    const seatInfo = `Table ${tableNumber}, Seat ${seatNumber}`;
                    const customerName = `${firstName} ${lastName}`;
                    
                    // Remove the booking from local data
                    delete this.bookings[bookingId];
                    this.saveBookings();
                    
                    // Update UI
                    this.renderBookingsTable();
                    this.updateStatistics();
                    this.generateHallPreview();
                    
                    // Show confirmation message
                    alert(`✅ Бронирование удалено!\n\nSeat ${seatInfo} освобождено и доступно для нового бронирования.\n\nКлиент: ${customerName}`);
                } else {
                    throw new Error(result.error || 'Ошибка при удалении бронирования');
                }
            } catch (error) {
                console.error('Error deleting booking:', error);
                alert(`❌ Ошибка при удалении бронирования: ${error.message}`);
            } finally {
                // Reset button state
                const deleteButton = document.querySelector(`button[onclick="adminPanel.deleteBooking('${bookingId}')"]`);
                if (deleteButton) {
                    deleteButton.disabled = false;
                    deleteButton.innerHTML = '<i class="fas fa-trash"></i> Delete';
                }
            }
        }
    }

    // Show notification to admin
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Hide notification after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // Update seat status in real-time
    updateSeatStatus(seatId, status) {
        console.log(`🔄 Updating seat ${seatId} to status: ${status}`);
        
        // Update the seat element if it exists
        const seatElement = document.querySelector(`[data-seat-id="${seatId}"]`);
        if (seatElement) {
            // Remove old status classes
            seatElement.classList.remove('booked', 'pending', 'available', 'prebooked');
            
            // Add new status class
            seatElement.classList.add(status);
            seatElement.dataset.status = status;
            
            // Update seat text if needed
            if (status === 'available') {
                seatElement.textContent = seatElement.dataset.seatNumber || '';
            }
        }
        
        // Update statistics
        this.updateStatistics();
    }

    prebookRandomSeats() {
        const count = parseInt(prompt('Сколько мест предзабронировать?', '10'));
        if (!count || count <= 0) return;

        const availableSeats = this.getAvailableSeats();
        const prebookCount = Math.min(count, availableSeats.length);
        
        for (let i = 0; i < prebookCount; i++) {
            const randomIndex = Math.floor(Math.random() * availableSeats.length);
            const seatId = availableSeats[randomIndex];
            this.prebookSeat(seatId);
            availableSeats.splice(randomIndex, 1);
        }

        this.saveData();
        this.generateHallPreview();
        this.updateStatistics();
        
        alert(`Предзабронировано ${prebookCount} мест для имитации высокого спроса`);
    }

    clearPrebookedSeats() {
        if (confirm('Очистить все предзабронированные места?')) {
            this.prebookedSeats.clear();
            this.saveData();
            this.generateHallPreview();
            this.updateStatistics();
            alert('Предзабронированные места очищены');
        }
    }

    prebookSeat(seatId) {
        this.prebookedSeats.add(seatId);
    }

    getAvailableSeats() {
        const allSeats = [];
        for (let table = 1; table <= 36; table++) {
            for (let seat = 1; seat <= 14; seat++) {
                const seatId = `${table}-${seat}`;
                const isBooked = Object.values(this.bookings).some(b => 
                    b.table == table && b.seat == seat && b.status !== 'cancelled'
                );
                if (!isBooked && !this.prebookedSeats.has(seatId)) {
                    allSeats.push(seatId);
                }
            }
        }
        return allSeats;
    }

    generateHallPreview() {
        const container = document.getElementById('hallLayoutPreview');
        container.innerHTML = '';

        // Create hall layout with curved theater-style arrangement
        const hallLayout = document.createElement('div');
        hallLayout.className = 'hall-layout-curved';

        // Create stage at the top
        const stage = document.createElement('div');
        stage.className = 'stage-area';
        stage.innerHTML = '<i class="fas fa-microphone"></i><span>СЦЕНА</span>';
        hallLayout.appendChild(stage);

        // Create entry at the bottom
        const entry = document.createElement('div');
        entry.className = 'entry-area';
        entry.innerHTML = '<i class="fas fa-door-open"></i><span>ВХОД</span>';
        hallLayout.appendChild(entry);

        // Create seating areas - left and right sections with curved arrangement
        const leftSection = document.createElement('div');
        leftSection.className = 'seating-section left-section';
        
        const rightSection = document.createElement('div');
        rightSection.className = 'seating-section right-section';

        // Generate tables for left section (tables 1-18)
        for (let table = 1; table <= 18; table++) {
            const tableDiv = this.createTablePreview(table, 'left');
            leftSection.appendChild(tableDiv);
        }

        // Generate tables for right section (tables 19-36)
        for (let table = 19; table <= 36; table++) {
            const tableDiv = this.createTablePreview(table, 'right');
            rightSection.appendChild(tableDiv);
        }

        hallLayout.appendChild(leftSection);
        hallLayout.appendChild(rightSection);

        container.appendChild(hallLayout);
        
        // Initialize hall element for pan/zoom
        this.hall = hallLayout; // hallLayout is already the .hall-layout-curved element
        if (this.hall) {
            this.setupTouchEvents();
        }
        
        // Apply current zoom level
        this.applyZoom();
    }

    createTablePreview(tableNumber, section) {
        const tableDiv = document.createElement('div');
        tableDiv.className = 'table-preview-curved';
        tableDiv.dataset.table = tableNumber;
        tableDiv.dataset.section = section;

        // Calculate position based on curved arrangement
        const position = this.calculateTablePosition(tableNumber, section);
        tableDiv.style.left = `${position.x}%`;
        tableDiv.style.top = `${position.y}%`;

        // Table number
        const tableNumberDiv = document.createElement('div');
        tableNumberDiv.className = 'table-number-curved';
        tableNumberDiv.textContent = tableNumber;
        tableDiv.appendChild(tableNumberDiv);

        // Table circle
        const tableCircle = document.createElement('div');
        tableCircle.className = 'table-circle-curved';
        tableCircle.addEventListener('click', () => this.showTableInfo(tableNumber));

        // Seats container
        const seatsContainer = document.createElement('div');
        seatsContainer.className = 'seats-container-curved';

        // Create 14 seats around the table in a circle with better spacing
        for (let seat = 1; seat <= 14; seat++) {
            const seatElement = document.createElement('div');
            seatElement.className = 'seat-curved available';
            seatElement.textContent = seat;
            seatElement.dataset.table = tableNumber;
            seatElement.dataset.seat = seat;
            seatElement.dataset.seatId = `${tableNumber}-${seat}`;

            // Position seats in a circle around the table with increased radius for better spacing
            const angle = (seat - 1) * (360 / 14);
            const radius = 65; // Increased distance from center for better spacing with larger seats
            const x = 50 + radius * Math.cos(angle * Math.PI / 180);
            const y = 50 + radius * Math.sin(angle * Math.PI / 180);

            seatElement.style.left = `${x}%`;
            seatElement.style.top = `${y}%`;

            // Set seat status and data attributes
            this.updateSeatStatus(seatElement, `${tableNumber}-${seat}`);
            seatElement.dataset.seatId = `${tableNumber}-${seat}`;
            seatElement.dataset.status = 'available'; // Default status

            seatsContainer.appendChild(seatElement);
        }

        tableCircle.appendChild(seatsContainer);
        tableDiv.appendChild(tableCircle);

        return tableDiv;
    }

    calculateTablePosition(tableNumber, section) {
        // Create arrangement matching the reference photo exactly with invisible table-sized spacing
        const isLeft = section === 'left';
        
        // Define positions to match the reference photo exactly with invisible table spacing
        const leftPositions = [
            // Row 1 (closest to stage) - matching photo layout with invisible table spacing
            { x: 6, y: 12 }, { x: 16, y: 9 }, { x: 26, y: 7 },
            // Row 2 - matching photo layout with invisible table spacing
            { x: 3, y: 24 }, { x: 13, y: 21 }, { x: 23, y: 19 }, { x: 33, y: 17 },
            // Row 3 - matching photo layout with invisible table spacing
            { x: 1, y: 36 }, { x: 11, y: 33 }, { x: 21, y: 31 }, { x: 31, y: 29 },
            // Row 4 - matching photo layout with invisible table spacing
            { x: 5, y: 48 }, { x: 15, y: 45 }, { x: 25, y: 43 }, { x: 35, y: 41 },
            // Row 5 - matching photo layout with invisible table spacing
            { x: 8, y: 60 }, { x: 18, y: 57 }, { x: 28, y: 55 }
        ];

        const rightPositions = [
            // Row 1 (closest to stage) - moved slightly left from center
            { x: 70, y: 7 }, { x: 80, y: 9 }, { x: 90, y: 12 },
            // Row 2 - moved slightly left from center
            { x: 63, y: 17 }, { x: 73, y: 19 }, { x: 83, y: 21 }, { x: 93, y: 24 },
            // Row 3 - moved slightly left from center
            { x: 65, y: 29 }, { x: 75, y: 31 }, { x: 85, y: 33 }, { x: 95, y: 36 },
            // Row 4 - moved slightly left from center
            { x: 61, y: 41 }, { x: 71, y: 43 }, { x: 81, y: 45 }, { x: 91, y: 48 },
            // Row 5 - moved slightly left from center
            { x: 68, y: 55 }, { x: 78, y: 57 }, { x: 88, y: 60 }
        ];

        const tableIndex = isLeft ? tableNumber - 1 : tableNumber - 19;
        const positions = isLeft ? leftPositions : rightPositions;
        return positions[tableIndex] || { x: 50, y: 50 };
    }

    updateSeatStatus(seatElement, seatId) {
        const [table, seat] = seatId.split('-');
        
        // Check if seat is booked
        const booking = Object.values(this.bookings).find(b => 
            b.table == table && b.seat == seat && b.status !== 'cancelled'
        );

        // Reset classes
        seatElement.className = 'seat-curved';

        let status = 'available';
        if (booking) {
            if (booking.status === 'paid' || booking.status === 'Paid') {
                seatElement.classList.add('booked');
                status = 'booked';
            } else if (booking.status === 'pending' || booking.status === 'awaiting confirmation') {
                seatElement.classList.add('pending');
                status = 'pending';
            }
        } else if (this.prebookedSeats.has(seatId)) {
            seatElement.classList.add('prebooked');
            status = 'prebooked';
        } else {
            seatElement.classList.add('available');
        }
        
        // Set data-status attribute for authoritative status
        seatElement.dataset.status = status;
    }

    // Zoom functionality
    zoomIn() {
        const currentIndex = this.zoomLevels.indexOf(this.zoomLevel);
        if (currentIndex < this.zoomLevels.length - 1) {
            this.zoomLevel = this.zoomLevels[currentIndex + 1];
            this.applyZoom();
        }
    }

    zoomOut() {
        const currentIndex = this.zoomLevels.indexOf(this.zoomLevel);
        if (currentIndex > 0) {
            this.zoomLevel = this.zoomLevels[currentIndex - 1];
            this.applyZoom();
        }
    }

    zoomReset() {
        this.zoomLevel = 100;
        this.applyZoom();
    }

    applyZoom() {
        const zoomLevelElement = document.getElementById('zoomLevel');
        
        // Convert zoom level percentage to scale (100% = 1.0)
        this.scale = this.zoomLevel / 100;
        
        // Clamp scale to min/max bounds
        this.scale = this.clamp(this.scale, this.minScale, this.maxScale);
        
        // Apply the combined transform (pan + zoom)
        if (this.hall) {
            this.applyTransform();
        }
        
        // Update zoom level display
        if (zoomLevelElement) {
            zoomLevelElement.textContent = `${this.zoomLevel}%`;
        }
        
        // Update button states
        const zoomInBtn = document.getElementById('zoomIn');
        const zoomOutBtn = document.getElementById('zoomOut');
        
        zoomInBtn.disabled = this.zoomLevel >= 200;
        zoomOutBtn.disabled = this.zoomLevel <= 50;
        
        // Apply smooth zoom to curved layout
        const curvedLayout = this.hall ? this.hall.querySelector('.hall-layout-curved') : null;
        if (curvedLayout) {
            const scale = this.zoomLevel / 100;
            // Update our pan/zoom state
            this.scale = scale;
            this.translateX = 0;
            this.translateY = 0;
            
            // Apply combined transform
            curvedLayout.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
            curvedLayout.style.transformOrigin = 'center center';
            curvedLayout.style.transition = 'transform 0.3s ease';
            
            // Adjust container height based on zoom level
            const containerHeight = Math.max(800, 1200 * scale);
            if (this.hall) {
                this.hall.style.height = `${containerHeight}px`;
            }
        }
    }

    showTableInfo(tableNumber) {
        const tableBookings = Object.values(this.bookings).filter(b => 
            b.table == tableNumber && b.status !== 'cancelled'
        );
        
        let message = `Table ${tableNumber}:\n`;
        if (tableBookings.length === 0) {
            message += 'Нет бронирований';
        } else {
            tableBookings.forEach(booking => {
                message += `Seat ${booking.seat}: ${booking.firstName} ${booking.lastName} (${this.getStatusText(booking.status)})\n`;
            });
        }
        
        alert(message);
    }

    showSeatInfo(seatId) {
        const [table, seat] = seatId.split('-');
        
        // Find the seat element to get its current status
        const seatElement = document.querySelector(`.seat-curved[data-seat-id="${seatId}"]`);
        const seatStatus = seatElement ? seatElement.dataset.status : 'active';
        
        const booking = Object.values(this.bookings).find(b => 
            b.table == table && b.seat == seat && b.status !== 'cancelled'
        );
        
        console.log('Seat info check:', { seatId, seatStatus, booking: !!booking });
        
        // Check seat status first (authoritative from server)
        if (seatStatus === 'booked' || seatStatus === 'paid' || seatStatus === 'reserved' || seatStatus === 'pending') {
            // Seat is not available - show unavailable message
            let statusText = 'Забронировано';
            let message = 'Это место недоступно для бронирования.';
            
            if (seatStatus === 'paid') {
                statusText = 'Оплачено';
            } else if (seatStatus === 'reserved') {
                statusText = 'Зарезервировано';
            } else if (seatStatus === 'pending') {
                statusText = 'В процессе бронирования';
                message = 'Это место забронировано, но еще не оплачено.';
            }
            
            alert(`Стол ${table}, Место ${seat}\nСтатус: ${statusText}\n${message}`);
        } else if (booking) {
            // Fallback to booking data if seat status is not set
            let message = `Стол ${table}, Место ${seat}:\n`;
            message += `Имя: ${booking.firstName} ${booking.lastName}\n`;
            message += `Телефон: ${booking.phone}\n`;
            message += `Email: ${booking.email}\n`;
            message += `Статус: ${this.getStatusText(booking.status)}\n`;
            message += `Дата бронирования: ${new Date(booking.bookingDate).toLocaleString('ru-RU')}`;
            
            alert(message);
        } else {
            // Seat is available
            alert(`Стол ${table}, Место ${seat}\nСтатус: Свободно\nЭто место доступно для бронирования.`);
        }
    }

    startManualReservation() {
        const table = prompt('Введите номер стола (1-36):');
        const seat = prompt('Введите номер места (1-14):');
        
        if (!table || !seat || isNaN(table) || isNaN(seat)) {
            alert('Неверные данные');
            return;
        }
        
        const tableNum = parseInt(table);
        const seatNum = parseInt(seat);
        
        if (tableNum < 1 || tableNum > 36 || seatNum < 1 || seatNum > 14) {
            alert('Неверный диапазон (стол: 1-36, место: 1-14)');
            return;
        }
        
        const seatId = `${tableNum}-${seatNum}`;
        const existingBooking = Object.values(this.bookings).find(b => 
            b.table == tableNum && b.seat == seatNum && b.status !== 'cancelled'
        );
        
        if (existingBooking) {
            alert('Seat уже забронировано');
            return;
        }
        
        const name = prompt('Введите имя для бронирования:');
        if (!name) return;
        
        const bookingId = 'ADM' + Date.now().toString(36).toUpperCase();
        this.bookings[bookingId] = {
            id: bookingId,
            firstName: name,
            lastName: 'Организатор',
            phone: '000-000-0000',
            email: 'admin@event.com',
            table: tableNum,
            seat: seatNum,
            seatId: seatId,
            price: 0,
            status: 'paid',
            bookingDate: new Date().toISOString(),
            paymentDate: new Date().toISOString(),
            isAdminReservation: true
        };
        
        this.saveBookings();
        this.renderBookingsTable();
        this.updateStatistics();
        this.generateHallPreview();
        
        alert(`Seat ${seatId} забронировано организатором`);
    }

    startManualRelease() {
        const table = prompt('Введите номер стола (1-36):');
        const seat = prompt('Введите номер места (1-14):');
        
        if (!table || !seat || isNaN(table) || isNaN(seat)) {
            alert('Неверные данные');
            return;
        }
        
        const tableNum = parseInt(table);
        const seatNum = parseInt(seat);
        const seatId = `${tableNum}-${seatNum}`;
        
        const booking = Object.values(this.bookings).find(b => 
            b.table == tableNum && b.seat == seatNum && b.status !== 'cancelled'
        );
        
        if (!booking) {
            alert('Seat не забронировано');
            return;
        }
        
        if (confirm(`Освободить место ${seatId} (${booking.firstName} ${booking.lastName})?`)) {
            delete this.bookings[booking.id];
            this.saveBookings();
            this.renderBookingsTable();
            this.updateStatistics();
            this.generateHallPreview();
            alert('Seat освобождено');
        }
    }

    // Release all seats (bulk operation)
    releaseAllSeats() {
        const totalBookings = Object.keys(this.bookings).length;
        
        if (totalBookings === 0) {
            alert('Нет забронированных мест для освобождения');
            return;
        }
        
        const confirmed = confirm(
            `ВНИМАНИЕ! Вы собираетесь освободить ВСЕ места (${totalBookings} бронирований).\n\n` +
            'Это действие нельзя отменить!\n\n' +
            'Продолжить?'
        );
        
        if (!confirmed) {
            return;
        }
        
        // Double confirmation for safety
        const doubleConfirm = confirm(
            `ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ!\n\n` +
            `Вы действительно хотите удалить ВСЕ ${totalBookings} бронирований?\n\n` +
            'Нажмите OK только если вы абсолютно уверены!'
        );
        
        if (!doubleConfirm) {
            return;
        }
        
        try {
            console.log('🔄 Admin releasing all seats...');
            
            // Clear all bookings
            this.bookings = {};
            this.saveBookings();
            
            // Update UI
            this.renderBookingsTable();
            this.updateStatistics();
            this.generateHallPreview();
            
            // Emit bulk release event to server
            if (this.socket && this.adminAuthenticated) {
                this.socket.emit('admin:releaseAllSeats', {
                    adminId: 'admin',
                    timestamp: Date.now(),
                    totalReleased: totalBookings
                });
                console.log('📡 Bulk release event sent to server');
            } else {
                console.warn('⚠️ Socket not connected or not authenticated, cannot emit bulk release event');
            }
            
            alert(`✅ Все места освобождены!\n\nУдалено бронирований: ${totalBookings}`);
            console.log(`✅ All seats released successfully. Removed ${totalBookings} bookings.`);
            
        } catch (error) {
            console.error('❌ Error releasing all seats:', error);
            alert('❌ Ошибка при освобождении мест. Проверьте консоль для подробностей.');
        }
    }

    // Seat Selection Methods
    addSeatsFromInput() {
        const input = document.getElementById('seatInput');
        const seatInput = input.value.trim();
        
        if (!seatInput) {
            alert('Пожалуйста, введите номера мест');
            return;
        }
        
        // Parse seat input (format: "1-1, 1-2, 2-5, 3-10")
        const seatStrings = seatInput.split(',').map(s => s.trim());
        const validSeats = [];
        const invalidSeats = [];
        
        seatStrings.forEach(seatStr => {
            if (this.isValidSeatId(seatStr)) {
                validSeats.push(seatStr);
                this.selectedSeats.add(seatStr);
            } else {
                invalidSeats.push(seatStr);
            }
        });
        
        if (validSeats.length > 0) {
            this.updateSelectedSeatsDisplay();
            input.value = ''; // Clear input
            console.log(`✅ Added ${validSeats.length} seats to selection:`, validSeats);
        }
        
        if (invalidSeats.length > 0) {
            alert(`Неверные форматы мест: ${invalidSeats.join(', ')}\n\nПравильный формат: стол-место (например: 1-1, 2-5, 3-10)`);
        }
    }

    isValidSeatId(seatId) {
        const parts = seatId.split('-');
        if (parts.length !== 2) return false;
        
        const table = parseInt(parts[0]);
        const seat = parseInt(parts[1]);
        
        return !isNaN(table) && !isNaN(seat) && 
               table >= 1 && table <= 36 && 
               seat >= 1 && seat <= 14;
    }

    updateSelectedSeatsDisplay() {
        const container = document.getElementById('selectedSeatsList');
        
        if (this.selectedSeats.size === 0) {
            container.innerHTML = '<span class="no-seats">Нет выбранных мест</span>';
            return;
        }
        
        container.innerHTML = '';
        this.selectedSeats.forEach(seatId => {
            const seatTag = document.createElement('div');
            seatTag.className = 'seat-tag';
            seatTag.innerHTML = `
                ${seatId}
                <button class="remove-seat" onclick="adminPanel.removeSeatFromSelection('${seatId}')">×</button>
            `;
            container.appendChild(seatTag);
        });
    }

    removeSeatFromSelection(seatId) {
        this.selectedSeats.delete(seatId);
        this.updateSelectedSeatsDisplay();
        console.log(`🗑️ Removed seat ${seatId} from selection`);
    }

    clearSeatSelection() {
        this.selectedSeats.clear();
        this.updateSelectedSeatsDisplay();
        console.log('🧹 Cleared seat selection');
    }

    prebookSelectedSeats() {
        if (this.selectedSeats.size === 0) {
            alert('Пожалуйста, выберите места для предварительного бронирования');
            return;
        }
        
        const seatIds = Array.from(this.selectedSeats);
        const confirmed = confirm(
            `Предварительно забронировать ${seatIds.length} мест?\n\n` +
            `Места: ${seatIds.join(', ')}\n\n` +
            'Продолжить?'
        );
        
        if (!confirmed) return;
        
        try {
            console.log('🔄 Pre-booking selected seats:', seatIds);
            
            // Emit pre-booking event to server
            if (this.socket && this.adminAuthenticated) {
                this.socket.emit('admin:prebookSeats', {
                    seatIds: seatIds,
                    prebookType: 'manual',
                    adminId: 'admin',
                    timestamp: Date.now()
                });
                console.log('📡 Pre-booking event sent to server');
            } else {
                console.warn('⚠️ Socket not connected or not authenticated, cannot emit pre-booking event');
                alert('❌ Нет соединения с сервером. Проверьте подключение.');
                return;
            }
            
            // Clear selection after sending
            this.clearSeatSelection();
            
        } catch (error) {
            console.error('❌ Error pre-booking seats:', error);
            alert('❌ Ошибка при предварительном бронировании мест.');
        }
    }

    // Handle pre-booking results from server
    handlePrebookResult(result) {
        if (result.success) {
            const message = `✅ Предварительное бронирование завершено!\n\n` +
                          `Booked: ${result.totalPrebooked} мест\n` +
                          `Уже занято: ${result.totalAlreadyBooked} мест\n\n` +
                          `Забронированные места: ${result.prebookedSeats.join(', ')}`;
            
            if (result.alreadyBookedSeats.length > 0) {
                alert(message + `\n\nУже занятые места: ${result.alreadyBookedSeats.join(', ')}`);
            } else {
                alert(message);
            }
            
            // Refresh the admin panel immediately
            this.loadBookings();
            this.updateStatistics();
            this.generateHallPreview();
            
            // Force immediate update of pre-booked seats column
            this.renderPrebookedTable();
            this.updatePrebookedStats();
            
            // Log the update
            console.log('✅ Pre-booking result received:', result);
            console.log(`📋 Admin column updated with ${result.totalPrebooked} pre-booked seats`);
            
            // Show visual feedback
            this.showPrebookUpdateNotification(result);
        } else {
            alert(`❌ Ошибка предварительного бронирования: ${result.error || 'Неизвестная ошибка'}`);
            console.error('❌ Pre-booking failed:', result);
        }
    }
    
    showPrebookUpdateNotification(result) {
        // Create or update notification
        let notification = document.getElementById('prebookNotification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'prebookNotification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #28a745;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                z-index: 10000;
                font-weight: bold;
                max-width: 300px;
            `;
            document.body.appendChild(notification);
        }
        
        notification.innerHTML = `
            <div>✅ Pre-booking Complete!</div>
            <div style="font-size: 14px; margin-top: 5px;">
                ${result.totalPrebooked} seats pre-booked (${result.prebookType})
            </div>
        `;
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (notification) {
                notification.remove();
            }
        }, 3000);
    }

    // Pre-booked Seats Management
    refreshPrebookedSeats() {
        console.log('🔄 Refreshing pre-booked seats...');
        this.loadBookings(); // This will also update pre-booked seats
        this.renderPrebookedTable();
        this.updatePrebookedStats();
    }

    renderPrebookedTable() {
        const tbody = document.getElementById('prebookedTableBody');
        if (!tbody) return;

        // Get all pre-booked seats
        const prebookedSeats = Object.values(this.bookings).filter(booking => 
            booking.status === 'prebooked'
        );

        if (prebookedSeats.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: #666; font-style: italic; padding: 20px;">
                        Нет предварительно забронированных мест
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = '';
        prebookedSeats.forEach(booking => {
            const row = document.createElement('tr');
            const seatId = `${booking.table}-${booking.seat}`;
            const prebookType = booking.prebookType || 'manual';
            const date = new Date(booking.timestamp).toLocaleString('ru-RU');
            
            row.innerHTML = `
                <td class="seat-cell">${seatId}</td>
                <td>
                    <span class="prebook-type ${prebookType}">${prebookType}</span>
                </td>
                <td class="date-cell">${date}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-release" onclick="adminPanel.releasePrebookedSeat('${booking.id}')" title="Освободить место">
                            <i class="fas fa-unlock"></i>
                        </button>
                        <button class="btn-info" onclick="adminPanel.viewPrebookedDetails('${booking.id}')" title="Подробности">
                            <i class="fas fa-info"></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(row);
        });

        console.log(`✅ Rendered ${prebookedSeats.length} pre-booked seats`);
    }

    updatePrebookedStats() {
        const prebookedSeats = Object.values(this.bookings).filter(booking => 
            booking.status === 'prebooked'
        );

        const totalPrebooked = prebookedSeats.length;
        const manualPrebooked = prebookedSeats.filter(booking => 
            booking.prebookType === 'manual'
        ).length;
        const randomPrebooked = prebookedSeats.filter(booking => 
            booking.prebookType === 'random'
        ).length;

        // Update stat cards
        const totalElement = document.getElementById('totalPrebookedSeats');
        const manualElement = document.getElementById('manualPrebookedSeats');
        const randomElement = document.getElementById('randomPrebookedSeats');

        if (totalElement) totalElement.textContent = totalPrebooked;
        if (manualElement) manualElement.textContent = manualPrebooked;
        if (randomElement) randomElement.textContent = randomPrebooked;

        console.log(`📊 Pre-booked stats: Total=${totalPrebooked}, Manual=${manualPrebooked}, Random=${randomPrebooked}`);
    }

    releasePrebookedSeat(bookingId) {
        const booking = this.bookings[bookingId];
        if (!booking) {
            alert('Бронирование не найдено');
            return;
        }

        const seatId = `${booking.table}-${booking.seat}`;
        const confirmed = confirm(
            `Освободить предварительно забронированное место ${seatId}?\n\n` +
            `Тип: ${booking.prebookType || 'manual'}\n` +
            'Это действие нельзя отменить!'
        );

        if (!confirmed) return;

        try {
            // Remove from local bookings
            delete this.bookings[bookingId];
            
            // Save to file
            this.saveBookings();
            
            // Update UI
            this.renderBookingsTable();
            this.renderPrebookedTable();
            this.updateStatistics();
            this.updatePrebookedStats();
            this.generateHallPreview();

            // Emit seat update to server
            if (this.socket && this.adminAuthenticated) {
                this.socket.emit('modifySeat', {
                    table: booking.table,
                    seat: booking.seat,
                    action: 'release',
                    adminId: 'admin',
                    timestamp: Date.now()
                });
                console.log('📡 Seat release event sent to server');
            }

            alert(`✅ Seat ${seatId} освобождено`);
            console.log(`✅ Released pre-booked seat ${seatId}`);

        } catch (error) {
            console.error('❌ Error releasing pre-booked seat:', error);
            alert('❌ Ошибка при освобождении места');
        }
    }

    viewPrebookedDetails(bookingId) {
        const booking = this.bookings[bookingId];
        if (!booking) {
            alert('Бронирование не найдено');
            return;
        }

        const seatId = `${booking.table}-${booking.seat}`;
        const date = new Date(booking.timestamp).toLocaleString('ru-RU');
        const prebookType = booking.prebookType || 'manual';

        const details = `
Детали предварительного бронирования:

Seat: ${seatId}
Тип: ${prebookType.toUpperCase()}
Дата создания: ${date}
ID бронирования: ${bookingId}
Status: ${booking.status}
Администратор: ${booking.adminAction ? 'Да' : 'Нет'}
        `;

        alert(details);
        console.log('📋 Pre-booked seat details:', booking);
    }

    clearAllPrebookedSeats() {
        const prebookedSeats = Object.values(this.bookings).filter(booking => 
            booking.status === 'prebooked'
        );

        if (prebookedSeats.length === 0) {
            alert('Нет предварительно забронированных мест для очистки');
            return;
        }

        const confirmed = confirm(
            `ВНИМАНИЕ! Вы собираетесь удалить ВСЕ предварительно забронированные места (${prebookedSeats.length} мест).\n\n` +
            'Это действие нельзя отменить!\n\n' +
            'Продолжить?'
        );

        if (!confirmed) return;

        const doubleConfirm = confirm(
            `ПОСЛЕДНЕЕ ПРЕДУПРЕЖДЕНИЕ!\n\n` +
            `Вы действительно хотите удалить ВСЕ ${prebookedSeats.length} предварительно забронированных мест?\n\n` +
            'Нажмите OK только если вы абсолютно уверены!'
        );

        if (!doubleConfirm) return;

        try {
            console.log('🔄 Clearing all pre-booked seats...');
            
            // Remove all pre-booked seats from local bookings
            Object.keys(this.bookings).forEach(bookingId => {
                if (this.bookings[bookingId].status === 'prebooked') {
                    delete this.bookings[bookingId];
                }
            });

            // Save to file
            this.saveBookings();

            // Update UI
            this.renderBookingsTable();
            this.renderPrebookedTable();
            this.updateStatistics();
            this.updatePrebookedStats();
            this.generateHallPreview();

            // Emit bulk release event to server
            if (this.socket && this.adminAuthenticated) {
                this.socket.emit('admin:releaseAllSeats', {
                    adminId: 'admin',
                    timestamp: Date.now(),
                    totalReleased: prebookedSeats.length,
                    prebookedOnly: true
                });
                console.log('📡 Bulk pre-booked seats release event sent to server');
            }

            alert(`✅ Все предварительно забронированные места очищены!\n\nУдалено мест: ${prebookedSeats.length}`);
            console.log(`✅ Cleared ${prebookedSeats.length} pre-booked seats`);

        } catch (error) {
            console.error('❌ Error clearing pre-booked seats:', error);
            alert('❌ Ошибка при очистке предварительно забронированных мест');
        }
    }

    updateStatistics() {
        const totalBookings = Object.keys(this.bookings).length;
        const pendingBookings = Object.values(this.bookings).filter(b => b.status === 'pending').length;
        const confirmedBookings = Object.values(this.bookings).filter(b => b.status === 'paid' || b.status === 'Paid').length;
        const availableSeats = 504 - Object.values(this.bookings).filter(b => b.status !== 'cancelled').length - this.prebookedSeats.size;

        document.getElementById('totalBookings').textContent = totalBookings;
        document.getElementById('pendingPayments').textContent = pendingBookings;
        document.getElementById('confirmedPayments').textContent = confirmedBookings;
        document.getElementById('availableSeats').textContent = availableSeats;
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
        modal.style.display = 'flex';
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
        modal.style.display = 'none';
    }

    saveBookings() {
        localStorage.setItem('zolotayaSeredinaBookings', JSON.stringify(this.bookings));
    }

    saveData() {
        const data = {
            prebookedSeats: Array.from(this.prebookedSeats)
        };
        localStorage.setItem('zolotayaSeredinaAdminData', JSON.stringify(data));
    }

    loadData() {
        const saved = localStorage.getItem('zolotayaSeredinaAdminData');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.prebookedSeats = new Set(data.prebookedSeats || []);
            } catch (e) {
                console.error('Error loading admin data:', e);
                this.prebookedSeats = new Set();
            }
        } else {
            this.prebookedSeats = new Set();
        }
    }

    // Ticket verification methods
    async verifyTicket() {
        const ticketInput = document.getElementById('ticketInput');
        const ticketId = ticketInput.value.trim();
        
        if (!ticketId) {
            this.showVerificationResult('error', 'Ошибка', 'Пожалуйста, введите ID билета');
            return;
        }

        try {
            const response = await fetch('/api/secure-tickets/verify-by-id', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ticketId })
            });

            const data = await response.json();

            if (data.success) {
                this.verificationStats.verifiedToday++;
                this.verificationStats.validTickets++;
                this.showVerificationResult('success', 'Ticket действителен', 
                    `Ticket ${ticketId} успешно проверен`, data.data);
                this.updateVerificationStats();
            } else {
                this.verificationStats.verifiedToday++;
                this.verificationStats.invalidTickets++;
                this.showVerificationResult('error', 'Ticket недействителен', 
                    data.message || 'Ticket не найден или уже использован');
                this.updateVerificationStats();
            }
        } catch (error) {
            console.error('Error verifying ticket:', error);
            this.showVerificationResult('error', 'Ошибка сервера', 
                'Не удалось проверить билет. Попробуйте еще раз.');
        }

        // Clear input
        ticketInput.value = '';
    }

    showVerificationResult(type, title, message, details = null) {
        const resultDiv = document.getElementById('verificationResult');
        const iconDiv = document.getElementById('resultIcon');
        const titleDiv = document.getElementById('resultTitle');
        const messageDiv = document.getElementById('resultMessage');
        const detailsDiv = document.getElementById('resultDetails');

        // Reset classes
        resultDiv.className = 'verification-result';
        resultDiv.classList.add(type);

        // Set icon
        if (type === 'success') {
            iconDiv.innerHTML = '<i class="fas fa-check-circle"></i>';
        } else if (type === 'error') {
            iconDiv.innerHTML = '<i class="fas fa-times-circle"></i>';
        } else if (type === 'warning') {
            iconDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        }

        // Set content
        titleDiv.textContent = title;
        messageDiv.textContent = message;

        // Set details if provided
        if (details) {
            detailsDiv.innerHTML = `
                <strong>Детали билета:</strong><br>
                Держатель: ${details.holderName || 'Не указано'}<br>
                Table: ${details.table || 'Не указано'}<br>
                Seat: ${details.seat || 'Не указано'}<br>
                Status: ${this.getStatusText(details.status)}<br>
                Создан: ${details.createdAt ? new Date(details.createdAt).toLocaleString('ru-RU') : 'Не указано'}
            `;
            detailsDiv.style.display = 'block';
        } else {
            detailsDiv.style.display = 'none';
        }

        // Show result
        resultDiv.style.display = 'block';

        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                resultDiv.style.display = 'none';
            }, 5000);
        }
    }

    getStatusText(status) {
        const statusMap = {
            'active': 'Активный',
            'pending': 'Ожидает подтверждения',
            'reserved': 'Booked',
            'used': 'Использован'
        };
        return statusMap[status] || status;
    }

    updateVerificationStats() {
        document.getElementById('verifiedToday').textContent = this.verificationStats.verifiedToday;
        document.getElementById('validTickets').textContent = this.verificationStats.validTickets;
        document.getElementById('invalidTickets').textContent = this.verificationStats.invalidTickets;
    }

    async refreshVerificationStats() {
        try {
            const response = await fetch('/api/secure-tickets/stats');
            const data = await response.json();
            
            if (data.success) {
                this.verificationStats.validTickets = data.data.totalTickets || 0;
                this.updateVerificationStats();
            }
        } catch (error) {
            console.error('Error refreshing stats:', error);
        }
    }

    async addTicketManually() {
        const form = document.getElementById('addTicketForm');
        const formData = new FormData(form);
        
        const ticketData = {
            ticketId: formData.get('ticketId'),
            holderName: formData.get('holderName'),
            table: parseInt(formData.get('table')),
            seat: parseInt(formData.get('seat')),
            status: formData.get('status')
        };

        try {
            const response = await fetch('/api/secure-tickets/add-manual', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(ticketData)
            });

            const data = await response.json();

            if (data.success) {
                this.showVerificationResult('success', 'Ticket добавлен', 
                    `Ticket ${ticketData.ticketId} успешно добавлен в систему`, data.data);
                form.reset();
                this.hideModal('addTicketModal');
                this.refreshVerificationStats();
            } else {
                this.showVerificationResult('error', 'Ошибка добавления', 
                    data.error || 'Не удалось добавить билет');
            }
        } catch (error) {
            console.error('Error adding ticket:', error);
            this.showVerificationResult('error', 'Ошибка сервера', 
                'Не удалось добавить билет. Попробуйте еще раз.');
        }
    }

    // Socket.IO initialization for real-time updates
    initializeSocket() {
        try {
            this.socket = io(window.location.origin, {
                transports: ['websocket', 'polling'],
                timeout: 20000,
                forceNew: true,
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000
            });
            
            this.socket.on('connect', () => {
                console.log('Admin panel connected to server via Socket.IO');
                // Authenticate as admin
                this.authenticateAsAdmin();
                
                // Also send identify event to ensure room assignment
                this.socket.emit('identify', { role: 'admin' });
            });
            
            this.socket.on('disconnect', () => {
                console.log('Admin panel disconnected from server');
            });
            
            this.socket.on('authSuccess', (data) => {
                console.log('✅ Admin authentication successful:', data);
                this.adminAuthenticated = true;
                
                if (data.room === 'admins') {
                    console.log('🏠 Admin joined admins room successfully');
                }
            });
            
            this.socket.on('authError', (error) => {
                console.error('❌ Admin authentication failed:', error);
                this.adminAuthenticated = false;
            });
            
            this.socket.on('seatUpdate', (data) => {
                console.log('Admin panel received seat update from server:', data);
                // Refresh admin data when seats are updated
                this.loadBookings();
                this.updateStatistics();
                this.generateHallPreview();
            });

            this.socket.on('seatBulkUpdate', (data) => {
                console.log('Admin panel received bulk seat update from server:', data);
                // Refresh admin data when bulk seats are updated
                this.loadBookings();
                this.updateStatistics();
                this.generateHallPreview();
                this.renderPrebookedTable();
                this.updatePrebookedStats();
            });

            this.socket.on('admin:prebookResult', (result) => {
                console.log('Admin panel received pre-booking result:', result);
                this.handlePrebookResult(result);
            });
            
            // Handle real-time seat status updates from other admins
            this.socket.on('update-seat-status', (data) => {
                console.log('📡 Admin panel received seat status update from admins room:', data);
                console.log('📊 Update type:', data.type, 'Data:', data.data);
                
                if (data.type === 'booking-created') {
                    console.log('📡 New booking created by another admin:', data.data);
                    this.showNotification(`Новое бронирование: ${data.data.firstName} ${data.data.lastName} - Table ${data.data.table}, Seat ${data.data.seat}`, 'info');
                } else if (data.type === 'payment-confirmed') {
                    console.log('📡 Payment confirmed by another admin:', data.data);
                    this.showNotification(`Оплата подтверждена: ${data.data.firstName} ${data.data.lastName} - Ticket ${data.data.ticketId}`, 'success');
                } else if (data.type === 'booking-deleted') {
                    console.log('📡 Booking deleted by another admin:', data.data);
                    this.showNotification(`Бронирование удалено: ${data.data.firstName} ${data.data.lastName} - Table ${data.data.table}, Seat ${data.data.seat}`, 'warning');
                }
                
                // Update individual seat status if provided
                if (data.seatId && data.status) {
                    const seatElement = document.querySelector(`[data-seat-id="${data.seatId}"]`);
                    if (seatElement) {
                        seatElement.dataset.status = data.status;
                        // Update CSS classes based on status
                        seatElement.classList.remove('booked', 'pending', 'prebooked', 'available');
                        if (data.status === 'booked' || data.status === 'paid' || data.status === 'reserved') {
                            seatElement.classList.add('booked');
                        } else if (data.status === 'pending') {
                            seatElement.classList.add('pending');
                        } else if (data.status === 'prebooked') {
                            seatElement.classList.add('prebooked');
                        } else {
                            seatElement.classList.add('available');
                        }
                    }
                }
                
                // Refresh admin data to show latest changes
                this.loadBookings();
                this.updateStatistics();
                this.generateHallPreview();
                this.renderPrebookedTable();
                this.updatePrebookedStats();
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('Admin panel Socket.IO connection error:', error);
            });
            
        } catch (error) {
            console.error('Error initializing Socket.IO in admin panel:', error);
        }
    }

    // Initialize seating plan image zoom functionality
    initializeSeatingPlanImage() {
        const image = document.getElementById('seatingPlanImage');
        if (!image) {
            console.warn('Seating plan image element not found');
            return;
        }

        // Add error handling for image loading
        image.addEventListener('error', (e) => {
            console.warn('Failed to load seating plan image:', e.target.src);
            console.log('Attempting to load fallback image...');
        });

        image.addEventListener('load', () => {
            console.log('Seating plan image loaded successfully:', image.src);
        });

        let isZoomed = false;

        image.addEventListener('click', () => {
            if (isZoomed) {
                // Zoom out
                image.classList.remove('zoomed');
                isZoomed = false;
            } else {
                // Zoom in
                image.classList.add('zoomed');
                isZoomed = true;
            }
        });

        // Double-tap to zoom on mobile
        let lastTap = 0;
        image.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 500 && tapLength > 0) {
                e.preventDefault();
                if (isZoomed) {
                    image.classList.remove('zoomed');
                    isZoomed = false;
                } else {
                    image.classList.add('zoomed');
                    isZoomed = true;
                }
            }
            lastTap = currentTime;
        });

        // Close zoom when clicking outside
        document.addEventListener('click', (e) => {
            if (isZoomed && !image.contains(e.target)) {
                image.classList.remove('zoomed');
                isZoomed = false;
            }
        });
    }
    
    authenticateAsAdmin() {
        console.log('🔐 Authenticating as admin...');
        this.socket.emit('authenticate', { 
            role: 'admin', 
            password: this.adminPassword 
        });
    }
    
    // Show notification for real-time updates
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                <span>${message}</span>
            </div>
        `;
        
        // Add styles if not already added
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: white;
                    border-left: 4px solid #007bff;
                    border-radius: 4px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    padding: 12px 16px;
                    z-index: 10000;
                    max-width: 400px;
                    animation: slideIn 0.3s ease-out;
                }
                .notification-success {
                    border-left-color: #28a745;
                }
                .notification-warning {
                    border-left-color: #ffc107;
                }
                .notification-content {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .notification-content i {
                    color: #007bff;
                }
                .notification-success .notification-content i {
                    color: #28a745;
                }
                .notification-warning .notification-content i {
                    color: #ffc107;
                }
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add to page
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
    }
}

// Initialize admin panel
let adminPanel;
document.addEventListener('DOMContentLoaded', () => {
    adminPanel = new AdminPanel();
});
