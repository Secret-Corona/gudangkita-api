# Gudangkita API - Inventory Management System

A comprehensive inventory management system built with Node.js, Express, and PostgreSQL.

## Features

### 🔐 Authentication & Authorization
- JWT-based authentication
- Role-based access control (User/Admin)
- Secure password hashing with bcrypt

### 📦 Inventory Management
- Real-time stock tracking
- Low stock alerts
- Automatic stock validation
- Stock adjustment and restocking

### 📋 Request Management
- User request submission with stock validation
- Admin approval/rejection workflow
- Public urgent requests (Kanal Umum)
- Real-time notifications via Socket.IO

### 📊 Reporting & Analytics
- Transaction history reports
- Audit logs for all activities
- Summary statistics
- CSV export functionality

### 🔔 Notifications
- Real-time WebSocket notifications
- SMTP email notifications
- Low stock alerts

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Real-time**: Socket.IO
- **Email**: Nodemailer
- **Logging**: Winston
- **Validation**: express-validator
- **Security**: Helmet, CORS, Rate limiting

## Installation

### Prerequisites
- Node.js 16+ 
- PostgreSQL 12+
- npm or yarn

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-repo/gudangkita-api.git
   cd gudangkita-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=gudangkita_db
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key_here
   JWT_EXPIRES_IN=7d

   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Email Configuration (SMTP)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your_email@gmail.com
   SMTP_PASSWORD=your_app_password
   SMTP_FROM=noreply@gudangkita.com

   # Admin Default Account
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin123
   ```

4. **Database Setup**
   ```bash
   # Create PostgreSQL database
   createdb gudangkita_db

   # Run database migrations and seeding
   npm run seed
   ```

5. **Start the server**
   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

The API will be available at `http://localhost:3000`

## API Documentation

### Authentication Endpoints

#### POST /api/auth/login
Login with username and password.

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### POST /api/auth/register
Register new user (admin functionality).

#### GET /api/auth/profile
Get current user profile (requires authentication).

### Stock Management Endpoints

#### GET /api/stock
Get all items with current stock (requires authentication).

**Query Parameters:**
- `search`: Filter by item name
- `low_stock`: Show only low stock items (true/false)

#### GET /api/stock/:id
Get specific item details.

#### PUT /api/stock/:id (Admin Only)
Update stock manually.

**Request:**
```json
{
  "stok_terkini": 100,
  "notes": "Manual adjustment"
}
```

#### POST /api/stock/restock (Admin Only)
Add new stock (restock).

**Request:**
```json
{
  "item_id": 1,
  "quantity": 50,
  "notes": "Weekly restock"
}
```

#### POST /api/stock/items (Admin Only)
Create new item.

### Request Management Endpoints

#### POST /api/request
Create new request (authenticated users).

**Request:**
```json
{
  "item_id": 1,
  "jumlah_diminta": 5,
  "is_urgent": false
}
```

#### GET /api/request
Get user's own requests.

#### GET /api/request/all (Admin Only)
Get all requests with filtering options.

#### PUT /api/request/:id/approve (Admin Only)
Approve a request.

**Request:**
```json
{
  "feedback_admin": "Approved for immediate use"
}
```

#### PUT /api/request/:id/reject (Admin Only)
Reject a request.

**Request:**
```json
{
  "feedback_admin": "Item currently out of stock"
}
```

### Public Endpoints

#### POST /api/public/request
Create urgent request without login (Kanal Umum).

**Request:**
```json
{
  "item_id": 1,
  "jumlah_diminta": 2,
  "public_requester_name": "John Doe",
  "public_requester_contact": "john@example.com / 081234567890"
}
```

#### GET /api/public/items
Get available items (public access).

#### GET /api/public/request/:id
Check public request status.

### Reporting Endpoints (Admin Only)

#### GET /api/report/transactions
Get transaction reports with filtering and CSV export.

**Query Parameters:**
- `start_date`: Start date (ISO format)
- `end_date`: End date (ISO format)
- `type`: Transaction type (request/pickup/restock/adjustment)
- `format`: Response format (json/csv)

#### GET /api/report/summary
Get summary statistics.

#### GET /api/report/audit-logs
Get audit logs with filtering.

## Real-time Events

The API provides real-time notifications via Socket.IO:

### Client Events to Listen:
- `new_request`: New request submitted
- `new_urgent_request`: New urgent public request
- `request_approved`: Request approved
- `request_rejected`: Request rejected
- `stock_updated`: Stock levels changed
- `item_restocked`: Item restocked

### Example Socket.IO Client:
```javascript
const socket = io('http://localhost:3000');

socket.on('new_request', (data) => {
  console.log('New request:', data);
});

socket.on('stock_updated', (data) => {
  console.log('Stock updated:', data);
});
```

## Default Accounts

After running the seeder, these accounts will be available:

**Admin Account:**
- Username: `admin`
- Password: `admin123`
- Role: `admin`

**Sample User Account:**
- Username: `user1`
- Password: `password123`
- Role: `user`

## Database Schema

### Users Table
- id, username, password, role, created_at, updated_at

### Items Table
- id, nama_barang, stok_terkini, satuan, deskripsi, minimum_stock, created_at, updated_at

### Requests Table
- id, user_id, item_id, jumlah_diminta, status, feedback_admin, is_urgent, is_public_request, etc.

### Transactions Table
- id, item_id, user_id, request_id, type, quantity, previous_stock, new_stock, notes, created_at

### Audit Logs Table
- id, user_id, action, entity_type, entity_id, details, ip_address, user_agent, timestamp

## Business Logic

### Stock Validation
- Automatic stock availability check when creating requests
- "Stok tidak mencukupi" notification for insufficient stock
- Automatic stock reduction upon request approval

### Role-Based Access Control
- **Users**: Can view stock, create requests, view own request history
- **Admins**: Full access including stock management, request approval, reports

### Audit Trail
- All activities logged with user details, timestamp, and action details
- Complete transaction history for accountability

## Security Features

- JWT authentication with expiration
- Password hashing with bcrypt
- Rate limiting to prevent abuse
- CORS and security headers
- Input validation and sanitization
- SQL injection prevention via Sequelize ORM

## Deployment

### Production Setup

1. Set `NODE_ENV=production` in environment
2. Use a production PostgreSQL database
3. Configure SMTP for email notifications
4. Set up reverse proxy (nginx) for SSL
5. Use PM2 for process management

### PM2 Example:
```bash
npm install -g pm2
pm2 start src/server.js --name gudangkita-api
pm2 startup
pm2 save
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository. 