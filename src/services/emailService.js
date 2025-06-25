const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * EmailService - Enhanced notification system for Gudangkita API
 * Week 6 Enhancement: Improved email templates and notification handling
 * Manages all email communications for request approvals and inventory alerts
 */
class EmailService {
  constructor() {
    // SMTP transporter configuration for production email delivery
    this.transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });

    // Service metadata for tracking and debugging
    this.serviceVersion = '2.0.0'; // Updated for Week 6 enhancements
    this.totalEmailsSent = 0;
    this.lastActivityTimestamp = null;

    // Verify connection on startup
    this.verifyConnection();
  }

  async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
    } catch (error) {
      logger.error('SMTP connection failed:', error);
    }
  }

  async sendEmail(options) {
    try {
      // Enhanced email options with improved metadata tracking
      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        // Week 6 Enhancement: Add email tracking headers
        headers: {
          'X-Gudangkita-Service': `EmailService v${this.serviceVersion}`,
          'X-Sent-At': new Date().toISOString()
        }
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      // Update service statistics for monitoring
      this.totalEmailsSent++;
      this.lastActivityTimestamp = new Date().toISOString();
      
      logger.info(`Email sent successfully to ${options.to} (Total sent: ${this.totalEmailsSent})`);
      return result;
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }

  async sendRequestNotification(request, type) {
    try {
      const { user, item } = request;
      let subject, text, html;

      switch (type) {
        case 'new_request':
          subject = `New Request: ${item.nama_barang}`;
          text = `A new request has been submitted for ${item.nama_barang} (Quantity: ${request.jumlah_diminta}) by ${user?.username || request.public_requester_name || 'Public User'}.`;
          html = `
            <h2>New Item Request</h2>
            <p><strong>Item:</strong> ${item.nama_barang}</p>
            <p><strong>Quantity:</strong> ${request.jumlah_diminta}</p>
            <p><strong>Requester:</strong> ${user?.username || request.public_requester_name || 'Public User'}</p>
            ${request.is_urgent ? '<p><strong>⚠️ URGENT REQUEST</strong></p>' : ''}
            ${request.is_public_request ? `<p><strong>Contact:</strong> ${request.public_requester_contact}</p>` : ''}
            <p><strong>Status:</strong> ${request.status}</p>
            <p><strong>Submitted:</strong> ${new Date(request.created_at).toLocaleString()}</p>
          `;
          break;

        case 'request_approved':
          subject = `Request Approved: ${item.nama_barang}`;
          text = `Your request for ${item.nama_barang} (Quantity: ${request.jumlah_diminta}) has been approved.`;
          html = `
            <h2>Request Approved ✅</h2>
            <p><strong>Item:</strong> ${item.nama_barang}</p>
            <p><strong>Quantity:</strong> ${request.jumlah_diminta}</p>
            <p><strong>Status:</strong> Approved</p>
            ${request.feedback_admin ? `<p><strong>Admin Feedback:</strong> ${request.feedback_admin}</p>` : ''}
            <p>Please coordinate pickup arrangements.</p>
          `;
          break;

        case 'request_rejected':
          subject = `Request Rejected: ${item.nama_barang}`;
          text = `Your request for ${item.nama_barang} (Quantity: ${request.jumlah_diminta}) has been rejected. Reason: ${request.feedback_admin}`;
          html = `
            <h2>Request Rejected ❌</h2>
            <p><strong>Item:</strong> ${item.nama_barang}</p>
            <p><strong>Quantity:</strong> ${request.jumlah_diminta}</p>
            <p><strong>Status:</strong> Rejected</p>
            <p><strong>Reason:</strong> ${request.feedback_admin}</p>
            <p>If you have questions, please contact the admin team.</p>
          `;
          break;

        default:
          throw new Error(`Unknown notification type: ${type}`);
      }

      // For now, we'll log the email instead of sending (since we don't have recipient emails in the model)
      logger.info(`Email notification [${type}]: ${subject}`);
      logger.debug('Email content:', { text, html });

      // In a real implementation, you would send emails to:
      // - Admins for new_request notifications
      // - Users for approved/rejected notifications
      // You'd need to add email fields to your User model and implement the actual sending

      return { success: true, message: 'Email notification processed' };

    } catch (error) {
      logger.error(`Failed to send ${type} notification:`, error);
      throw error;
    }
  }

  async sendLowStockAlert(items) {
    try {
      const subject = `Low Stock Alert - ${items.length} items need attention`;
      
      const itemsList = items.map(item => 
        `- ${item.nama_barang}: ${item.stok_terkini} remaining (minimum: ${item.minimum_stock})`
      ).join('\n');

      const text = `The following items are running low on stock:\n\n${itemsList}\n\nPlease restock these items as soon as possible.`;
      
      const html = `
        <h2>🚨 Low Stock Alert</h2>
        <p>The following items are running low on stock:</p>
        <ul>
          ${items.map(item => `
            <li>
              <strong>${item.nama_barang}</strong>: 
              ${item.stok_terkini} remaining 
              <span style="color: red;">(minimum: ${item.minimum_stock})</span>
            </li>
          `).join('')}
        </ul>
        <p><strong>Action required:</strong> Please restock these items as soon as possible.</p>
        <p><em>This is an automated alert from the Gudangkita Inventory System.</em></p>
      `;

      logger.info(`Low stock alert generated for ${items.length} items`);
      logger.debug('Low stock alert content:', { text, html });

      return { success: true, message: 'Low stock alert processed' };

    } catch (error) {
      logger.error('Failed to send low stock alert:', error);
      throw error;
    }
  }

  async sendStockUpdateNotification(item, change) {
    try {
      const subject = `Stock Updated: ${item.nama_barang}`;
      
      const text = `Stock has been updated for ${item.nama_barang}. Previous: ${change.previous_stock}, New: ${change.new_stock}, Change: ${change.new_stock - change.previous_stock}`;
      
      const html = `
        <h2>📦 Stock Update Notification</h2>
        <p><strong>Item:</strong> ${item.nama_barang}</p>
        <p><strong>Previous Stock:</strong> ${change.previous_stock}</p>
        <p><strong>New Stock:</strong> ${change.new_stock}</p>
        <p><strong>Change:</strong> ${change.new_stock - change.previous_stock}</p>
        <p><strong>Updated by:</strong> ${change.updated_by || 'System'}</p>
        <p><strong>Updated at:</strong> ${new Date().toLocaleString()}</p>
        ${change.reason ? `<p><strong>Reason:</strong> ${change.reason}</p>` : ''}
      `;

      logger.info(`Stock update notification for ${item.nama_barang}`);
      
      return { success: true, message: 'Stock update notification processed' };

    } catch (error) {
      logger.error('Failed to send stock update notification:', error);
      throw error;
    }
  }
}

module.exports = new EmailService(); 