const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { Item, Transaction, AuditLog } = require('../database/models');
const { authenticateToken, requireAdmin, requireUser } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * STOCK MODULE - Week 6 Enhancement
 * ==================================
 * Enhanced stock management with real-time updates and comprehensive audit logging
 * Features:
 * - Real-time stock tracking with low stock alerts
 * - Comprehensive restock functionality with transaction logging
 * - Audit trail for all stock operations
 * - WebSocket integration for real-time updates
 * - Advanced stock status monitoring
 */

// GET /api/stock - Get all items with current stock (real-time)
// Enhanced with advanced filtering and real-time status monitoring
router.get('/', authenticateToken, requireUser, async (req, res, next) => {
  try {
    const { search, low_stock } = req.query;
    
    let whereClause = {};
    
    // Search by item name if provided - Case insensitive search
    if (search) {
      whereClause.nama_barang = {
        [require('sequelize').Op.iLike]: `%${search}%`
      };
    }

    const items = await Item.findAll({
      where: whereClause,
      order: [['nama_barang', 'ASC']]
    });

    // Filter low stock items if requested - Enhanced stock monitoring
    let filteredItems = items;
    if (low_stock === 'true') {
      filteredItems = items.filter(item => item.isLowStock());
    }

    // Add enhanced stock status to each item - Week 6 Enhancement
    const itemsWithStatus = filteredItems.map(item => ({
      ...item.toJSON(),
      is_low_stock: item.isLowStock(),
      stock_status: item.stok_terkini === 0 ? 'out_of_stock' : 
                   item.isLowStock() ? 'low_stock' : 'in_stock',
      // Week 6 Enhancement: Add stock level percentage
      stock_level_percentage: item.minimum_stock > 0 ? 
                            Math.round((item.stok_terkini / item.minimum_stock) * 100) : 100
    }));

    // Enhanced logging for stock monitoring
    logger.info(`Stock query executed: ${itemsWithStatus.length} items returned ${search ? `(search: ${search})` : ''}`);

    res.json({
      items: itemsWithStatus,
      total: itemsWithStatus.length,
      low_stock_count: itemsWithStatus.filter(item => item.is_low_stock).length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error fetching stock items:', error);
    next(error);
  }
});

// GET /api/stock/:id - Get specific item details
// Enhanced with comprehensive stock information
router.get('/:id', [
  param('id').isInt().withMessage('Item ID must be an integer')
], authenticateToken, requireUser, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const item = await Item.findByPk(req.params.id);
    if (!item) {
      logger.warn(`Item not found: ID ${req.params.id} requested by user ${req.user.username}`);
      return res.status(404).json({
        error: 'Item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }

    // Week 6 Enhancement: Add comprehensive item information
    const itemWithExtendedInfo = {
      ...item.toJSON(),
      is_low_stock: item.isLowStock(),
      stock_status: item.stok_terkini === 0 ? 'out_of_stock' : 
                   item.isLowStock() ? 'low_stock' : 'in_stock',
      stock_level_percentage: item.minimum_stock > 0 ? 
                            Math.round((item.stok_terkini / item.minimum_stock) * 100) : 100,
      can_fulfill_requests: item.stok_terkini > 0
    };

    logger.debug(`Item details retrieved: ${item.nama_barang} by ${req.user.username}`);

    res.json({
      item: itemWithExtendedInfo
    });

  } catch (error) {
    logger.error(`Error fetching item ${req.params.id}:`, error);
    next(error);
  }
});

// PUT /api/stock/:id - Update stock manually (admin only)
// Enhanced with comprehensive transaction logging and validation
router.put('/:id', [
  param('id').isInt().withMessage('Item ID must be an integer'),
  body('stok_terkini')
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer'),
  body('notes')
    .optional()
    .isString()
    .withMessage('Notes must be a string')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { stok_terkini, notes } = req.body;
    const itemId = req.params.id;

    const item = await Item.findByPk(itemId);
    if (!item) {
      logger.warn(`Stock update attempted on non-existent item: ID ${itemId} by ${req.user.username}`);
      return res.status(404).json({
        error: 'Item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }

    const previousStock = item.stok_terkini;
    const stockChange = stok_terkini - previousStock;

    // Week 6 Enhancement: Add stock change validation and warnings
    if (Math.abs(stockChange) > 1000) {
      logger.warn(`Large stock adjustment detected: ${item.nama_barang} change: ${stockChange} by ${req.user.username}`);
    }

    // Update item stock
    await item.update({ stok_terkini });

    // Enhanced transaction logging with more details
    await Transaction.create({
      item_id: itemId,
      user_id: req.user.id,
      type: 'adjustment',
      quantity: Math.abs(stockChange),
      previous_stock: previousStock,
      new_stock: stok_terkini,
      notes: notes || `Manual stock adjustment by admin ${req.user.username}`
    });

    // Enhanced audit logging - Week 6 Enhancement
    await AuditLog.logAction({
      user_id: req.user.id,
      action: 'update_stock',
      entity_type: 'item',
      entity_id: itemId,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        item_name: item.nama_barang,
        previous_stock: previousStock,
        new_stock: stok_terkini,
        stock_change: stockChange,
        adjustment_type: stockChange > 0 ? 'increase' : 'decrease',
        notes,
        timestamp: new Date().toISOString()
      }
    });

    // Enhanced real-time update via Socket.IO
    req.io.emit('stock_updated', {
      item_id: itemId,
      nama_barang: item.nama_barang,
      previous_stock: previousStock,
      new_stock: stok_terkini,
      stock_change: stockChange,
      adjustment_type: stockChange > 0 ? 'increase' : 'decrease',
      updated_by: req.user.username,
      timestamp: new Date().toISOString()
    });

    logger.info(`Stock updated for item ${item.nama_barang}: ${previousStock} -> ${stok_terkini} (${stockChange > 0 ? '+' : ''}${stockChange}) by ${req.user.username}`);

    res.json({
      message: 'Stock updated successfully',
      item: {
        ...item.toJSON(),
        is_low_stock: item.isLowStock(),
        stock_status: item.stok_terkini === 0 ? 'out_of_stock' : 
                     item.isLowStock() ? 'low_stock' : 'in_stock',
        stock_level_percentage: item.minimum_stock > 0 ? 
                              Math.round((item.stok_terkini / item.minimum_stock) * 100) : 100
      },
      stock_change: stockChange,
      adjustment_type: stockChange > 0 ? 'increase' : 'decrease'
    });

  } catch (error) {
    logger.error(`Error updating stock for item ${req.params.id}:`, error);
    next(error);
  }
});

// POST /api/stock/restock - Add new stock (restock) - admin only
// Enhanced restock functionality with comprehensive logging
router.post('/restock', [
  body('item_id')
    .isInt()
    .withMessage('Item ID must be an integer'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('notes')
    .optional()
    .isString()
    .withMessage('Notes must be a string')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { item_id, quantity, notes } = req.body;

    const item = await Item.findByPk(item_id);
    if (!item) {
      logger.warn(`Restock attempted on non-existent item: ID ${item_id} by ${req.user.username}`);
      return res.status(404).json({
        error: 'Item not found',
        code: 'ITEM_NOT_FOUND'
      });
    }

    const previousStock = item.stok_terkini;
    const newStock = previousStock + quantity;

    // Week 6 Enhancement: Add large restock validation
    if (quantity > 10000) {
      logger.warn(`Large restock detected: ${item.nama_barang} quantity: ${quantity} by ${req.user.username}`);
    }

    // Update item stock
    await item.update({ stok_terkini: newStock });

    // Enhanced transaction logging
    await Transaction.create({
      item_id,
      user_id: req.user.id,
      type: 'restock',
      quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      notes: notes || `Restocked by admin ${req.user.username}`
    });

    // Enhanced audit logging - Week 6 Enhancement
    await AuditLog.logAction({
      user_id: req.user.id,
      action: 'restock',
      entity_type: 'item',
      entity_id: item_id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        item_name: item.nama_barang,
        quantity_added: quantity,
        previous_stock: previousStock,
        new_stock: newStock,
        restock_percentage: previousStock > 0 ? 
                          Math.round((quantity / previousStock) * 100) : 0,
        notes,
        timestamp: new Date().toISOString()
      }
    });

    // Enhanced real-time update via Socket.IO
    req.io.emit('item_restocked', {
      item_id,
      nama_barang: item.nama_barang,
      quantity_added: quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      restocked_by: req.user.username,
      timestamp: new Date().toISOString()
    });

    logger.info(`Item ${item.nama_barang} restocked: +${quantity} (${previousStock} -> ${newStock}) by ${req.user.username}`);

    res.json({
      message: 'Item restocked successfully',
      item: {
        ...item.toJSON(),
        is_low_stock: item.isLowStock(),
        stock_status: item.stok_terkini === 0 ? 'out_of_stock' : 
                     item.isLowStock() ? 'low_stock' : 'in_stock',
        stock_level_percentage: item.minimum_stock > 0 ? 
                              Math.round((item.stok_terkini / item.minimum_stock) * 100) : 100
      },
      quantity_added: quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      restock_percentage: previousStock > 0 ? 
                        Math.round((quantity / previousStock) * 100) : 0
    });

  } catch (error) {
    logger.error(`Error restocking item ${req.body.item_id}:`, error);
    next(error);
  }
});

// POST /api/stock/items - Create new item (admin only)
router.post('/items', [
  body('nama_barang')
    .notEmpty()
    .withMessage('Item name is required')
    .isLength({ max: 100 })
    .withMessage('Item name must not exceed 100 characters'),
  body('stok_terkini')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer'),
  body('satuan')
    .optional()
    .isString()
    .withMessage('Unit must be a string'),
  body('deskripsi')
    .optional()
    .isString()
    .withMessage('Description must be a string'),
  body('minimum_stock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum stock must be a non-negative integer')
], authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { nama_barang, stok_terkini = 0, satuan = 'pcs', deskripsi, minimum_stock = 5 } = req.body;

    // Check if item already exists
    const existingItem = await Item.findOne({ where: { nama_barang } });
    if (existingItem) {
      return res.status(409).json({
        error: 'Item already exists',
        code: 'ITEM_EXISTS'
      });
    }

    // Create new item
    const item = await Item.create({
      nama_barang,
      stok_terkini,
      satuan,
      deskripsi,
      minimum_stock
    });

    // Log transaction if initial stock > 0
    if (stok_terkini > 0) {
      await Transaction.create({
        item_id: item.id,
        user_id: req.user.id,
        type: 'restock',
        quantity: stok_terkini,
        previous_stock: 0,
        new_stock: stok_terkini,
        notes: `Initial stock for new item: ${nama_barang}`
      });
    }

    // Log audit
    await AuditLog.logAction({
      user_id: req.user.id,
      action: 'create_item',
      entity_type: 'item',
      entity_id: item.id,
      ip_address: req.ip,
      user_agent: req.get('User-Agent'),
      details: {
        nama_barang,
        stok_terkini,
        satuan,
        minimum_stock
      }
    });

    logger.info(`New item created: ${nama_barang} with stock: ${stok_terkini} by ${req.user.username}`);

    res.status(201).json({
      message: 'Item created successfully',
      item: {
        ...item.toJSON(),
        is_low_stock: item.isLowStock(),
        stock_status: item.stok_terkini === 0 ? 'out_of_stock' : 
                     item.isLowStock() ? 'low_stock' : 'in_stock'
      }
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router; 