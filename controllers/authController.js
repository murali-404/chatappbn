const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Setup PostgreSQL connection
const pool = new Pool({
    connectionString: 'postgresql://root:kCBuMhyQpnu2uacBpPCwgtDuuTuhN38v@dpg-cvubgchr0fns73fvqj6g-a.oregon-postgres.render.com/test_kl8i',
    ssl: {
        rejectUnauthorized: false // required for Render
    }              // Default PostgreSQL port
});

// Register new user
exports.register = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 1) {
            return res.status(409).json({ message: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const insertRes = await pool.query(
            'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id',
            [email, hashedPassword]
        );

        return res.status(201).json({
            message: "User registered successfully",
            result: insertRes.rows[0].id
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Something went wrong" });
    }
};

// User login
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "User not found" });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = generateAuthToken(user.id);

        await pool.query(
            'INSERT INTO tokens (user_id, token, updated_at) VALUES ($1, $2, $3)',
            [user.id, token, new Date()]
        );

        return res.status(200).json({ message: "Login successfully", token });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Something went wrong" });
    }
};

// Generate JWT Token
function generateAuthToken(userId) {
    const payload = { userId };
    const secretKey = 'your_secret_key';  // Replace with your secure secret key
    return jwt.sign(payload, secretKey);
}
