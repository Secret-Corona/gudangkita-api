const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Request, Item, User, Transaction, AuditLog } = require('../database/models');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * REQUEST MODULE - Week 6 Enhancement
 * ===================================
 * Enhanced request management with comprehensive approval/reject workflows
 * Features:
 * - Advanced request validation with stock availability checks
 * - Comprehensive audit trail for all request operations
 * - Enhanced approval/reject workflows with detailed logging
 * - Real-time notifications for admin actions
 * - Email notifications for status changes
 * - Detailed transaction logging for stock operations
 */

// POST /api/request - Create new request (user)
// Enhanced with comprehensive validation and audit logging
router.post('/', [
  body('item_id')
    .isInt()
    .withMessage('Item ID must be an integer'),
  body('jumlah_diminta')
    .isInt({ min: 1 })
    .withMessage('Requested quantity must be a positive integer'),
  body('is_urgent')
    .optional()
    .isBoolean()
    .withMessage('Urgent flag must be a boolean')
], authenticateToken, requireUser, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { item_id, jumlah_diminta, is_urgent = false } = req.body;

    // Check if item exists with enhanced logging
    const item = await Item.findByPk(item_id);
    if (!item) {
      logger.warn(`Request creation failed: Item ${item_id} not found by user ${req.user.username}`, {
        userId: req.user.id,
        username: req.user.username,
        itemId: item_id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      return res.status(404).json({
        error: 'Item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }

    // Check stock availability with detailed logging
    if (!item.canFulfillRequest(jumlah_diminta)) {
      // Week 6 Enhancement: Log insufficient stock attempts for analytics
      logger.warn(`Request creation failed: Insufficient stock for ${item.nama_barang} by ${req.user.username}`, {
        userId: req.user.id,
        username: req.user.username,
        itemId: item_id,
        itemName: item.nama_barang,
        requestedQuantity: jumlah_diminta,
        availableStock: item.stok_terkini,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      return res.status(400).json({
        error: 'Stok tidak mencukupi',
        code: 'INSUFFICIENT_STOCK',
        available_stock: item.stok_terkini,
        requested_quantity: jumlah_diminta
      });
    }

    // Create request with enhanced data
    const request = await Request.create({
      user_id: req.user.id,
      item_id,
      jumlah_diminta,
      is_urgent
    });

    // Load related data for response
    const requestWithDetails = await Request.findByPk(request.id, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role'] },
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ]
    });

    // Enhanced audit logging - Week 6 Enhancement
    await AuditLog.logAction({
      user_id: req.user.id,
      action: 'create_request',
      entity_type: 'request',
      entity_id: request.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        item_name: item.nama_barang,
        quantity_requested: jumlah_diminta,
        is_urgent,
        available_stock: item.stok_terkini,
        request_priority: is_urgent ? 'high' : 'normal',
        timestamp: new Date().toISOString()
      }
    });

    // Enhanced real-time notification to admins - Week 6 Enhancement
    req.io.emit('new_request', {
      request_id: request.id,
      user: req.user.username,
      item: item.nama_barang,
      quantity: jumlah_diminta,
      is_urgent,
      priority: is_urgent ? 'high' : 'normal',
      available_stock: item.stok_terkini,
      timestamp: new Date().toISOString()
    });

    logger.info(`New request created: ${item.nama_barang} x${jumlah_diminta} by ${req.user.username}${is_urgent ? ' (URGENT)' : ''}`, {
      userId: req.user.id,
      username: req.user.username,
      requestId: request.id,
      itemName: item.nama_barang,
      quantity: jumlah_diminta,
      isUrgent: is_urgent,
      timestamp: new Date().toISOString()
    });

    res.status(201).json({
      message: 'Request created successfully',
      request: requestWithDetails
    });

  } catch (error) {
    logger.error('Error creating request:', error);
    next(error);
  }
});

// GET /api/request - Get user's own requests
// Enhanced with filtering and pagination
router.get('/', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    let whereClause = { user_id: req.user.id };
    
    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const { count, rows: requests } = await Request.findAndCountAll({
      where: whereClause,
      include: [
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Week 6 Enhancement: Add request statistics for user dashboard
    const stats = {
      total_requests: requests.length,
      pending_count: requests.filter(r => r.status === 'pending').length,
      approved_count: requests.filter(r => r.status === 'approved').length,
      rejected_count: requests.filter(r => r.status === 'rejected').length
    };

    res.json({
      requests,
      statistics: stats,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        per_page: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Error fetching user requests:', error);
    next(error);
  }
});

// GET /api/request/all - Get all requests (admin only)
// Enhanced with comprehensive filtering and statistics
router.get('/all', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { status, user_id, item_id, page = 1, limit = 10, urgent_only = false } = req.query;
    
    let whereClause = {};
    
    if (status) {
      whereClause.status = status;
    }
    if (user_id) {
      whereClause.user_id = user_id;
    }
    if (item_id) {
      whereClause.item_id = item_id;
    }
    if (urgent_only === 'true') {
      whereClause.is_urgent = true;
    }

    const offset = (page - 1) * limit;

    const { count, rows: requests } = await Request.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role', 'email'] },
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ],
      order: [['is_urgent', 'DESC'], ['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Week 6 Enhancement: Add comprehensive admin statistics
    const allRequests = await Request.findAll();
    const stats = {
      total_requests: allRequests.length,
      pending_count: allRequests.filter(r => r.status === 'pending').length,
      approved_count: allRequests.filter(r => r.status === 'approved').length,
      rejected_count: allRequests.filter(r => r.status === 'rejected').length,
      urgent_count: allRequests.filter(r => r.is_urgent).length,
      recent_activity: allRequests.filter(r => 
        new Date(r.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length
    };

    logger.debug(`Admin ${req.user.username} retrieved ${requests.length} requests`, {
      adminId: req.user.id,
      adminUsername: req.user.username,
      filters: { status, user_id, item_id, urgent_only },
      resultCount: requests.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      requests,
      statistics: stats,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        per_page: parseInt(limit)
      }
    });

  } catch (error) {
    logger.error('Error fetching all requests:', error);
    next(error);
  }
});

// PUT /api/request/:id/approve - Approve request (admin only)
// Enhanced approval workflow with comprehensive validation and audit trail
// Week 6 Enhancement: Added detailed logging and validation for approval process
router.put('/:id/approve', [
  param('id').isInt().withMessage('Request ID must be an integer'),
  body('feedback_admin')
    .optional()
    .isString()
    .withMessage('Admin feedback must be a string')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    // Input validation with detailed error reporting
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(`Approval validation failed for request ${req.params.id}:`, errors.array());
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const requestId = req.params.id;
    const { feedback_admin } = req.body;
    
    // Enhanced logging for approval attempt
    logger.info(`Admin ${req.user.username} attempting to approve request ${requestId}`);

    const request = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role', 'email'] },
        { model: Item, as: 'item' }
      ]
    });

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    // Business logic validation: Check if request is in approvable state
    if (!request.canBeApproved()) {
      logger.warn(`Cannot approve request ${requestId}: current status is ${request.status}`);
      return res.status(400).json({
        error: 'Request cannot be approved',
        code: 'CANNOT_APPROVE',
        current_status: request.status
      });
    }

    // Critical stock validation: Ensure adequate inventory before approval
    // This prevents overselling and maintains inventory accuracy
    if (!request.item.canFulfillRequest(request.jumlah_diminta)) {
      logger.error(`Insufficient stock for approval: Item ${request.item.nama_barang}, Available: ${request.item.stok_terkini}, Requested: ${request.jumlah_diminta}`);
      return res.status(400).json({
        error: 'Stok tidak mencukupi',
        code: 'INSUFFICIENT_STOCK',
        available_stock: request.item.stok_terkini,
        requested_quantity: request.jumlah_diminta
      });
    }

    // Execute stock deduction: Critical inventory management operation
    // This is the point of no return - stock will be permanently reduced
    const previousStock = request.item.stok_terkini;
    const newStock = previousStock - request.jumlah_diminta;
    
    logger.info(`Reducing stock for ${request.item.nama_barang}: ${previousStock} → ${newStock} (Qty: ${request.jumlah_diminta})`);
    await request.item.update({ stok_terkini: newStock });

    // Update request status to approved with complete audit information
    // Timestamp and admin ID recorded for full accountability
    await request.update({
      status: 'approved',
      approved_by: req.user.id,
      approved_at: new Date(),
      feedback_admin
    });

    // Log transaction
    await Transaction.create({
      item_id: request.item_id,
      user_id: request.user_id,
      request_id: requestId,
      type: 'pickup',
      quantity: request.jumlah_diminta,
      previous_stock: previousStock,
      new_stock: newStock,
      notes: `Request approved and stock reduced - ${feedback_admin || 'No feedback'}`
    });

    // Log audit
    await AuditLog.logAction({
      user_id: req.user.id,
      action: 'approve_request',
      entity_type: 'request',
      entity_id: requestId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        requester: request.user?.username || 'Public',
        item_name: request.item.nama_barang,
        quantity: request.jumlah_diminta,
        previous_stock: previousStock,
        new_stock: newStock,
        feedback_admin
      }
    });

    // Emit real-time notifications
    req.io.emit('request_approved', {
      request_id: requestId,
      user_id: request.user_id,
      item: request.item.nama_barang,
      quantity: request.jumlah_diminta,
      approved_by: req.user.username,
      timestamp: new Date().toISOString()
    });

    req.io.emit('stock_updated', {
      item_id: request.item_id,
      nama_barang: request.item.nama_barang,
      previous_stock: previousStock,
      new_stock: newStock,
      updated_by: req.user.username,
      reason: 'request_approved',
      timestamp: new Date().toISOString()
    });

    logger.info(`Request approved: ${request.item.nama_barang} x${request.jumlah_diminta} for ${request.user?.username || 'Public'} by ${req.user.username}`);

    // Send email notification for approval
    try {
      await emailService.sendRequestNotification(request, 'request_approved');
    } catch (emailError) {
      logger.error('Failed to send approval email notification:', emailError);
      // Continue with the response even if email fails
    }

    // Reload request with updated data
    const updatedRequest = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role', 'email'] },
        { model: Item, as: 'item' }
      ]
    });

    res.json({
      message: 'Request approved successfully',
      request: updatedRequest,
      stock_change: {
        previous_stock: previousStock,
        new_stock: newStock,
        quantity_reduced: request.jumlah_diminta
      }
    });

  } catch (error) {
    next(error);
  }
});

// PUT /api/request/:id/reject - Reject request (admin only)
// Week 6 Enhancement: Enhanced rejection workflow with mandatory feedback and audit trail
router.put('/:id/reject', [
  param('id').isInt().withMessage('Request ID must be an integer'),
  body('feedback_admin')
    .notEmpty()
    .withMessage('Admin feedback is required for rejection')
    .isString()
    .withMessage('Admin feedback must be a string')
    .isLength({ min: 10 })
    .withMessage('Feedback must be at least 10 characters for clarity')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    // Enhanced validation with detailed error reporting
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(`Request rejection validation failed for request ${req.params.id}:`, errors.array());
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const requestId = req.params.id;
    const { feedback_admin } = req.body;
    
    // Enhanced logging for rejection attempt
    logger.info(`Admin ${req.user.username} attempting to reject request ${requestId} with feedback: "${feedback_admin}"`);

    const request = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role', 'email'] },
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ]
    });

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    // Business logic validation: Ensure request can be rejected
    if (!request.canBeRejected()) {
      logger.warn(`Cannot reject request ${requestId}: current status is ${request.status}`);
      return res.status(400).json({
        error: 'Request cannot be rejected',
        code: 'CANNOT_REJECT',
        current_status: request.status
      });
    }

    // Update request status
    await request.update({
      status: 'rejected',
      approved_by: req.user.id,
      approved_at: new Date(),
      feedback_admin
    });

    // Log audit
    await AuditLog.logAction({
      user_id: req.user.id,
      action: 'reject_request',
      entity_type: 'request',
      entity_id: requestId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        requester: request.user?.username || 'Public',
        item_name: request.item.nama_barang,
        quantity: request.jumlah_diminta,
        feedback_admin
      }
    });

    // Emit real-time notification
    req.io.emit('request_rejected', {
      request_id: requestId,
      user_id: request.user_id,
      item: request.item.nama_barang,
      quantity: request.jumlah_diminta,
      rejected_by: req.user.username,
      feedback: feedback_admin,
      timestamp: new Date().toISOString()
    });

    logger.info(`Request rejected: ${request.item.nama_barang} x${request.jumlah_diminta} for ${request.user?.username || 'Public'} by ${req.user.username}`);

    // Send email notification for rejection
    try {
      await emailService.sendRequestNotification(request, 'request_rejected');
    } catch (emailError) {
      logger.error('Failed to send rejection email notification:', emailError);
      // Continue with the response even if email fails
    }

    // Reload request with updated data
    const updatedRequest = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role', 'email'] },
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ]
    });

    res.json({
      message: 'Request rejected successfully',
      request: updatedRequest
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/request/:id - Get specific request details
router.get('/:id', [
  param('id').isInt().withMessage('Request ID must be an integer')
], authenticateToken, requireUser, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const requestId = req.params.id;
    
    let whereClause = { id: requestId };
    
    // If not admin, only allow viewing own requests
    if (req.user.role !== 'admin') {
      whereClause.user_id = req.user.id;
    }

    const request = await Request.findOne({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role'] },
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] },
        { 
          model: Transaction, 
          as: 'transactions',
          include: [
            { model: User, as: 'user', attributes: ['id', 'username'] }
          ]
        }
      ]
    });

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    res.json({
      request
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/request/test-email - Test email notification (admin only)
router.post('/test-email', [
  body('email')
    .isEmail()
    .withMessage('Valid email address is required'),
  body('type')
    .isIn(['approval', 'rejection', 'basic'])
    .withMessage('Type must be one of: approval, rejection, basic')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { email, type } = req.body;

    try {
      let result;
      
      if (type === 'basic') {
        // Test basic email sending
        result = await emailService.sendEmail({
          to: email,
          subject: 'Test Email from Gudangkita API',
          text: 'This is a test email to verify SMTP configuration.',
          html: `
            <h2>🧪 Test Email</h2>
            <p>This is a test email from the Gudangkita Inventory Management System.</p>
            <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Service Version:</strong> ${emailService.serviceVersion}</p>
            <p>If you receive this email, your SMTP configuration is working correctly!</p>
          `
        });
      } else {
        // Test notification emails with mock data
        const mockRequest = {
          user: { username: 'testuser' },
          item: { nama_barang: 'Test Item - Laptop Dell' },
          jumlah_diminta: 2,
          feedback_admin: type === 'approval' ? 'Approved for testing purposes' : 'Rejected for testing purposes',
          created_at: new Date()
        };

        const notificationType = type === 'approval' ? 'request_approved' : 'request_rejected';
        result = await emailService.sendRequestNotification(mockRequest, notificationType);
        
        // Also send the actual email for testing
        await emailService.sendEmail({
          to: email,
          subject: `Test ${type === 'approval' ? 'Approval' : 'Rejection'} Notification`,
          html: type === 'approval' ? `
            <h2>Request Approved ✅</h2>
            <p><strong>Item:</strong> Test Item - Laptop Dell</p>
            <p><strong>Quantity:</strong> 2</p>
            <p><strong>Status:</strong> Approved</p>
            <p><strong>Admin Feedback:</strong> Approved for testing purposes</p>
            <p>Please coordinate pickup arrangements.</p>
            <p><em>This is a test email from Gudangkita API</em></p>
          ` : `
            <h2>Request Rejected ❌</h2>
            <p><strong>Item:</strong> Test Item - Laptop Dell</p>
            <p><strong>Quantity:</strong> 2</p>
            <p><strong>Status:</strong> Rejected</p>
            <p><strong>Reason:</strong> Rejected for testing purposes</p>
            <p>If you have questions, please contact the admin team.</p>
            <p><em>This is a test email from Gudangkita API</em></p>
          `
        });
      }

      res.json({
        message: 'Test email sent successfully',
        details: {
          email_sent_to: email,
          type: type,
          smtp_connection: 'verified',
          total_emails_sent: emailService.totalEmailsSent,
          service_version: emailService.serviceVersion,
          timestamp: new Date().toISOString()
        }
      });

    } catch (emailError) {
      logger.error('Test email failed:', emailError);
      res.status(500).json({
        error: 'Failed to send test email',
        details: emailError.message,
        smtp_connection: 'failed'
      });
    }

  } catch (error) {
    next(error);
  }
});

module.exports = router; 