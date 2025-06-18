const express = require('express');
const { body, validationResult } = require('express-validator');
const { Request, Item, AuditLog } = require('../database/models');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/public/request - Create urgent request without login (Kanal Umum)
router.post('/request', [
  body('item_id')
    .isInt()
    .withMessage('Item ID must be an integer'),
  body('jumlah_diminta')
    .isInt({ min: 1 })
    .withMessage('Requested quantity must be a positive integer'),
  body('public_requester_name')
    .notEmpty()
    .withMessage('Requester name is required')
    .isLength({ max: 100 })
    .withMessage('Requester name must not exceed 100 characters'),
  body('public_requester_contact')
    .notEmpty()
    .withMessage('Contact information is required')
    .isLength({ max: 100 })
    .withMessage('Contact information must not exceed 100 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { 
      item_id, 
      jumlah_diminta, 
      public_requester_name, 
      public_requester_contact 
    } = req.body;

    // Check if item exists
    const item = await Item.findByPk(item_id);
    if (!item) {
      return res.status(404).json({
        error: 'Item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }

    // Create public request (marked as urgent by default)
    const request = await Request.create({
      user_id: null, // No user for public requests
      item_id,
      jumlah_diminta,
      is_urgent: true,
      is_public_request: true,
      public_requester_name,
      public_requester_contact
    });

    // Load related data for response
    const requestWithDetails = await Request.findByPk(request.id, {
      include: [
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan'] }
      ]
    });

    // Log audit (without user_id)
    await AuditLog.logAction({
      user_id: null,
      action: 'create_request',
      entity_type: 'request',
      entity_id: request.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        item_name: item.nama_barang,
        quantity_requested: jumlah_diminta,
        is_urgent: true,
        is_public_request: true,
        public_requester_name,
        public_requester_contact
      }
    });

    // Emit real-time notification to admins
    req.io.emit('new_urgent_request', {
      request_id: request.id,
      requester_name: public_requester_name,
      requester_contact: public_requester_contact,
      item: item.nama_barang,
      quantity: jumlah_diminta,
      is_public: true,
      timestamp: new Date().toISOString()
    });

    logger.info(`New urgent public request: ${item.nama_barang} x${jumlah_diminta} by ${public_requester_name} (${public_requester_contact})`);

    res.status(201).json({
      message: 'Urgent request submitted successfully',
      request: requestWithDetails,
      note: 'Your urgent request has been submitted and will be reviewed by our admin team as soon as possible.'
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/public/items - Get available items (public access)
router.get('/items', async (req, res, next) => {
  try {
    const { search } = req.query;
    
    let whereClause = {};
    
    // Search by item name if provided
    if (search) {
      whereClause.nama_barang = {
        [require('sequelize').Op.iLike]: `%${search}%`
      };
    }

    // Only show items with stock > 0
    whereClause.stok_terkini = {
      [require('sequelize').Op.gt]: 0
    };

    const items = await Item.findAll({
      where: whereClause,
      attributes: ['id', 'nama_barang', 'stok_terkini', 'satuan', 'deskripsi'],
      order: [['nama_barang', 'ASC']]
    });

    // Add availability status
    const itemsWithStatus = items.map(item => ({
      ...item.toJSON(),
      is_available: item.stok_terkini > 0,
      is_low_stock: item.isLowStock()
    }));

    res.json({
      items: itemsWithStatus,
      total: itemsWithStatus.length,
      note: 'This is public access. Only available items are shown.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

// GET /api/public/request/:id - Check public request status
router.get('/request/:id', async (req, res, next) => {
  try {
    const requestId = req.params.id;

    const request = await Request.findOne({
      where: { 
        id: requestId,
        is_public_request: true 
      },
      include: [
        { model: Item, as: 'item', attributes: ['id', 'nama_barang', 'satuan'] }
      ],
      attributes: [
        'id', 
        'jumlah_diminta', 
        'status', 
        'feedback_admin', 
        'created_at', 
        'approved_at',
        'public_requester_name',
        'public_requester_contact'
      ]
    });

    if (!request) {
      return res.status(404).json({
        error: 'Request not found',
        code: 'REQUEST_NOT_FOUND',
        note: 'Please check your request ID or contact our support team.'
      });
    }

    res.json({
      request,
      note: request.status === 'pending' ? 
        'Your request is being reviewed. You will be contacted via the provided contact information.' :
        request.status === 'approved' ?
        'Your request has been approved. Please coordinate pickup via your contact information.' :
        'Your request was not approved. Please check the admin feedback.'
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router; 