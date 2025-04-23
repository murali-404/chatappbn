const { Client } = require('pg');

// PostgreSQL connection config
const client = new Client({
    connectionString: 'postgresql://root:kCBuMhyQpnu2uacBpPCwgtDuuTuhN38v@dpg-cvubgchr0fns73fvqj6g-a.oregon-postgres.render.com/test_kl8i',
    ssl: {
      rejectUnauthorized: false // required for Render
    }
});

async function createTables() {
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL database.');

    // Completely drop the users table (including data and schema)
    const dropUserTable = `
      DROP TABLE IF EXISTS users CASCADE;
    `;
    await client.query(dropUserTable);
    console.log('🗑️ Dropped the users table completely.');

    // Create a new users table
    const newUserTable = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `;

    const tokensTable = `
      CREATE TABLE IF NOT EXISTS tokens (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        token VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);
    `;

    const messagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id VARCHAR(50),
        receiver_id VARCHAR(50),
        message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered BOOLEAN DEFAULT FALSE
      );
    `;

    // Create new tables
    await client.query(newUserTable);
    console.log('🗃️ New users table created or already exists.');

    await client.query(tokensTable);
    console.log('🔑 tokens table created or already exists.');

    await client.query(messagesTable);
    console.log('✉️ messages table created or already exists.');

  } catch (err) {
    console.error('❌ Error creating tables:', err.stack);
  } finally {
    await client.end();
    console.log('🔌 Connection closed.');
  }
}

createTables();
