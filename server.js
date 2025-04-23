const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
const app = express();

app.use(cors());
app.use(cors({
  origin: '*',  // Allow all origins (replace with your domain in production)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// PostgreSQL DB Config
const db = new Pool({
  connectionString: 'postgresql://root:kCBuMhyQpnu2uacBpPCwgtDuuTuhN38v@dpg-cvubgchr0fns73fvqj6g-a.oregon-postgres.render.com/test_kl8i',
  ssl: {
    rejectUnauthorized: false // required for Render
  }
});

// Routes
// const userDetailsRoutes = require('./routes/userDetailsRoutes');
// const loginRoutes = require('./routes/loginRoutes');
const authRoutes = require('./routes/authRoutes');

// app.use('/api/login', loginRoutes);
// app.use('/api/userDetials', userDetailsRoutes);
app.use('/api/auth', authRoutes);

// Get messages between two users
app.get('/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const query = `
      SELECT * FROM messages
      WHERE (sender_id = $1 AND receiver_id = $2)
         OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY timestamp ASC
    `;
    const result = await db.query(query, [user1, user2]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Latest conversations for user1
app.get('/conversations/:user1', async (req, res) => {
  const { user1 } = req.params;
  try {
    const query = `
      SELECT * FROM (
        SELECT *, 
               ROW_NUMBER() OVER (PARTITION BY receiver_id ORDER BY timestamp DESC) AS rn
        FROM messages
        WHERE sender_id = $1
      ) AS temp
      WHERE rn = 1;
    `;
    const result = await db.query(query, [user1]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Find user by email
app.get('/find/:user2', async (req, res) => {
  const { user2 } = req.params;
  try {
    const query = `SELECT * FROM users WHERE email = $1`;
    const result = await db.query(query, [user2]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    } else {
      return res.status(200).json({ message: `User: ${user2} found` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/findall', async (req, res) => {
  try {
    const query = `SELECT * FROM users`;
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const userSocketMap = {};

io.on('connection', socket => {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('register', userId => {
    userSocketMap[userId] = socket.id;
    console.log(`✅ Registered user ${userId} with socket ${socket.id}`);
  });

  socket.on('getLatestMessages', async senderId => {
    const query = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY 
            CASE 
              WHEN sender_id < receiver_id THEN sender_id || '_' || receiver_id
              ELSE receiver_id || '_' || sender_id
            END
          ORDER BY timestamp DESC
        ) AS rn
        FROM messages
        WHERE sender_id = $1 OR receiver_id = $1
      ) AS temp
      WHERE rn = 1;
    `;
    try {
      const result = await db.query(query, [senderId]);
      socket.emit('latestMessages', result.rows);
    } catch (err) {
      console.error('Query error:', err);
      socket.emit('error', 'Database error');
    }
  });

  socket.on('conversations', async data => {
    const { from, to, message } = data;
    const targetSocket = userSocketMap[to];

    try {
      await db.query(
        `INSERT INTO messages (sender_id, receiver_id, message, delivered) VALUES ($1, $2, $3, $4)`,
        [from, to, message, targetSocket ? 1 : 0]
      );

      if (targetSocket) {
        io.to(targetSocket).emit('private_message', { from, message });
      }

      console.log(`📨 ${from} ➡️ ${to}: ${message}`);
    } catch (err) {
      console.error('Insert error:', err);
    }
  });

  socket.on('private_message', async data => {
    const { from, to, message } = data;
    const targetSocket = userSocketMap[to];

    try {
      await db.query(
        `INSERT INTO messages (sender_id, receiver_id, message, delivered) VALUES ($1, $2, $3, $4)`,
        [from, to, message, targetSocket ? 1 : 0]
      );

      if (targetSocket) {
        const query = `
          SELECT * FROM (
            SELECT *, ROW_NUMBER() OVER (
              PARTITION BY 
                CASE 
                  WHEN sender_id < receiver_id THEN sender_id || '_' || receiver_id
                  ELSE receiver_id || '_' || sender_id
                END
              ORDER BY timestamp DESC
            ) AS rn
            FROM messages
            WHERE sender_id = $1 OR receiver_id = $1
          ) AS temp
          WHERE rn = 1;
        `;
        const result = await db.query(query, [to]);
        io.to(targetSocket).emit('latestMessages', result.rows);
        io.to(targetSocket).emit('private_message', { from, message });
      }

      console.log(`📨 ${from} ➡️ ${to}: ${message}`);
    } catch (err) {
      console.error('Error:', err);
    }
  });

  socket.on('disconnect', () => {
    const userId = Object.keys(userSocketMap).find(uid => userSocketMap[uid] === socket.id);
    if (userId) {
      delete userSocketMap[userId];
      console.log(`❌ User ${userId} disconnected`);
    }
  });
});

server.listen(3000, () => {
  console.log(`🚀 Server running at http://localhost:3000`);
});
