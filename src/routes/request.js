const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Request, Item, User, Transaction, AuditLog } = require('../database/models');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/request - Create new request (user)
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

    // Check if item exists
    const item = await Item.findByPk(item_id);
    if (!item) {
      return res.status(404).json({
        error: 'Item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }

    // Check stock availability
    if (!item.canFulfillRequest(jumlah_diminta)) {
      return res.status(400).json({
        error: 'Stok tidak mencukupi',
        code: 'INSUFFICIENT_STOCK',
        available_stock: item.stok_terkini,
        requested_quantity: jumlah_diminta
      });
    }

    // Create request
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

    // Log audit
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
        is_urgent
      }
    });

    // Emit real-time notification to admins
    req.io.emit('new_request', {
      request_id: request.id,
      user: req.user.username,
      item: item.nama_barang,
      quantity: jumlah_diminta,
      is_urgent,
      timestamp: new Date().toISOString()
    });

    logger.info(`New request created: ${item.nama_barang} x${jumlah_diminta} by ${req.user.username}${is_urgent ? ' (URGENT)' : ''}`);

    res.status(201).json({
      message: 'Request created successfully',
      request: requestWithDetails
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/request - Get user's own requests
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

    res.json({
      requests,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        per_page: parseInt(limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/request/all - Get all requests (admin only)
router.get('/all', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { status, user_id, item_id, page = 1, limit = 10 } = req.query;
    
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

    const offset = (page - 1) * limit;

    const { count, rows: requests } = await Request.findAndCountAll({
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role'] },
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      requests,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limit),
        total_items: count,
        per_page: parseInt(limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// PUT /api/request/:id/approve - Approve request (admin only)
router.put('/:id/approve', [
  param('id').isInt().withMessage('Request ID must be an integer'),
  body('feedback_admin')
    .optional()
    .isString()
    .withMessage('Admin feedback must be a string')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const requestId = req.params.id;
    const { feedback_admin } = req.body;

    const request = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role'] },
        { model: Item, as: 'item' }
      ]
    });

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    if (!request.canBeApproved()) {
      return res.status(400).json({
        error: 'Request cannot be approved',
        code: 'CANNOT_APPROVE',
        current_status: request.status
      });
    }

    // Check if stock is still available
    if (!request.item.canFulfillRequest(request.jumlah_diminta)) {
      return res.status(400).json({
        error: 'Stok tidak mencukupi',
        code: 'INSUFFICIENT_STOCK',
        available_stock: request.item.stok_terkini,
        requested_quantity: request.jumlah_diminta
      });
    }

    // Update item stock (subtract)
    const previousStock = request.item.stok_terkini;
    const newStock = previousStock - request.jumlah_diminta;
    
    await request.item.update({ stok_terkini: newStock });

    // Update request status
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

    // Reload request with updated data
    const updatedRequest = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role'] },
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
router.put('/:id/reject', [
  param('id').isInt().withMessage('Request ID must be an integer'),
  body('feedback_admin')
    .notEmpty()
    .withMessage('Admin feedback is required for rejection')
    .isString()
    .withMessage('Admin feedback must be a string')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const requestId = req.params.id;
    const { feedback_admin } = req.body;

    const request = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role'] },
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ]
    });

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        code: 'REQUEST_NOT_FOUND'
      });
    }

    if (!request.canBeRejected()) {
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

    // Reload request with updated data
    const updatedRequest = await Request.findByPk(requestId, {
      include: [
        { model: User, as: 'user', attributes: ['id', 'username', 'role'] },
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

module.exports = router; 