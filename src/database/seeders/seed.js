require('dotenv').config();
const { sequelize, User, Item } = require('../models');
const logger = require('../../utils/logger');

const seedDatabase = async () => {
  try {
    logger.info('Starting database seeding...');

    // Sync database first
    await sequelize.sync({ force: false });

    // Create admin user if not exists
    const adminExists = await User.findOne({ where: { username: process.env.ADMIN_USERNAME || 'admin' } });
    
    if (!adminExists) {
      const admin = await User.create({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123',
        role: 'admin'
      });
      logger.info(`Admin user created: ${admin.username}`);
    } else {
      logger.info('Admin user already exists');
    }

    // Create sample user if not exists
    const userExists = await User.findOne({ where: { username: 'user1' } });
    
    if (!userExists) {
      const user = await User.create({
        username: 'user1',
        password: 'password123',
        role: 'user'
      });
      logger.info(`Sample user created: ${user.username}`);
    } else {
      logger.info('Sample user already exists');
    }

    // Sample items data
    const sampleItems = [
      {
        nama_barang: 'Laptop Dell Latitude 5520',
        stok_terkini: 15,
        satuan: 'unit',
        deskripsi: 'Laptop untuk keperluan kerja kantor',
        minimum_stock: 5
      },
      {
        nama_barang: 'Mouse Logitech Wireless',
        stok_terkini: 50,
        satuan: 'pcs',
        deskripsi: 'Mouse wireless untuk komputer',
        minimum_stock: 10
      },
      {
        nama_barang: 'Keyboard Mechanical',
        stok_terkini: 25,
        satuan: 'pcs',
        deskripsi: 'Keyboard mechanical gaming',
        minimum_stock: 8
      },
      {
        nama_barang: 'Monitor LG 24 inch',
        stok_terkini: 8,
        satuan: 'unit',
        deskripsi: 'Monitor untuk komputer kantor',
        minimum_stock: 3
      },
      {
        nama_barang: 'Kabel HDMI',
        stok_terkini: 30,
        satuan: 'pcs',
        deskripsi: 'Kabel HDMI 2 meter',
        minimum_stock: 15
      },
      {
        nama_barang: 'Printer HP LaserJet',
        stok_terkini: 5,
        satuan: 'unit',
        deskripsi: 'Printer laser hitam putih',
        minimum_stock: 2
      },
      {
        nama_barang: 'Toner Printer HP',
        stok_terkini: 12,
        satuan: 'cartridge',
        deskripsi: 'Toner untuk printer HP LaserJet',
        minimum_stock: 5
      },
      {
        nama_barang: 'Flashdisk 32GB',
        stok_terkini: 40,
        satuan: 'pcs',
        deskripsi: 'Flashdisk USB 3.0 32GB',
        minimum_stock: 20
      },
      {
        nama_barang: 'Webcam Logitech C920',
        stok_terkini: 10,
        satuan: 'unit',
        deskripsi: 'Webcam HD untuk video conference',
        minimum_stock: 3
      },
      {
        nama_barang: 'Headset Gaming',
        stok_terkini: 18,
        satuan: 'pcs',
        deskripsi: 'Headset gaming dengan microphone',
        minimum_stock: 8
      },
      {
        nama_barang: 'Speaker Bluetooth',
        stok_terkini: 6,
        satuan: 'unit',
        deskripsi: 'Speaker bluetooth portable',
        minimum_stock: 4
      },
      {
        nama_barang: 'Powerbank 20000mAh',
        stok_terkini: 22,
        satuan: 'pcs',
        deskripsi: 'Powerbank kapasitas besar',
        minimum_stock: 10
      },
      {
        nama_barang: 'Adaptor Laptop Universal',
        stok_terkini: 14,
        satuan: 'pcs',
        deskripsi: 'Adaptor laptop universal 90W',
        minimum_stock: 6
      },
      {
        nama_barang: 'Kabel LAN Cat6',
        stok_terkini: 100,
        satuan: 'meter',
        deskripsi: 'Kabel LAN kategori 6',
        minimum_stock: 50
      },
      {
        nama_barang: 'Switch Network 8 Port',
        stok_terkini: 4,
        satuan: 'unit',
        deskripsi: 'Switch network 8 port gigabit',
        minimum_stock: 2
      }
    ];

    // Create items if they don't exist
    for (const itemData of sampleItems) {
      const existingItem = await Item.findOne({ where: { nama_barang: itemData.nama_barang } });
      
      if (!existingItem) {
        const item = await Item.create(itemData);
        logger.info(`Sample item created: ${item.nama_barang}`);
      }
    }

    logger.info('Database seeding completed successfully!');
    
    // Print summary
    const totalUsers = await User.count();
    const totalItems = await Item.count();
    const totalStock = await Item.sum('stok_terkini');
    
    logger.info(`Summary:`);
    logger.info(`- Total users: ${totalUsers}`);
    logger.info(`- Total items: ${totalItems}`);
    logger.info(`- Total stock: ${totalStock}`);

  } catch (error) {
    logger.error('Database seeding failed:', error);
    throw error;
  }
};

// Run seeding if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seeding script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding script failed:', error);
      process.exit(1);
    });
}

module.exports = seedDatabase; 