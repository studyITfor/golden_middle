// Railway migration script to add missing columns
const { Pool } = require('pg');

async function addMissingColumns() {
  let pool;
  
  try {
    // Connect to Railway PostgreSQL database
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    console.log('🔧 Adding missing columns to bookings table in Railway...');
    
    // Add missing columns one by one
    const columns = [
      'ADD COLUMN IF NOT EXISTS whatsapp_sent BOOLEAN DEFAULT FALSE',
      'ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(100)',
      'ADD COLUMN IF NOT EXISTS confirmation_error TEXT',
      'ADD COLUMN IF NOT EXISTS phone VARCHAR(20)',
      'ADD COLUMN IF NOT EXISTS table_number INT',
      'ADD COLUMN IF NOT EXISTS seat_number INT'
    ];
    
    for (const column of columns) {
      try {
        await pool.query(`ALTER TABLE bookings ${column};`);
        console.log(`✅ Added column: ${column.split(' ')[4]}`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️ Column already exists: ${column.split(' ')[4]}`);
        } else {
          console.error(`❌ Error adding column ${column.split(' ')[4]}:`, error.message);
        }
      }
    }
    
    console.log('✅ All missing columns added successfully');
    
    // Show current table structure
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'bookings' 
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Current bookings table structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
    });
    
  } catch (error) {
    console.error('❌ Error adding columns:', error);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Only run if DATABASE_URL is set (Railway environment)
if (process.env.DATABASE_URL) {
  addMissingColumns();
} else {
  console.log('⚠️ DATABASE_URL not set, skipping migration');
}
