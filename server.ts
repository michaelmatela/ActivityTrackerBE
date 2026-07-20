import express, { Request, Response } from 'express';
import sqlite3 from 'sqlite3';
const cors = require('cors');
const app = express();

const PORT = 3000;

app.use(cors());
app.use(express.json());

// Connect to SQLite (using an in-memory DB for this example)
const db = new sqlite3.Database(':memory:', (err) => {
    if (err) return console.error(err.message);
    console.log('Connected to the SQLite database.');
});

// Setup Table Schema
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS heartbeats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            window_title TEXT,
            is_idle BOOLEAN,
            heartbeat BOOLEAN,
            timestamp TEXT NOT NULL,
            application TEXT
        )
    `);
});

// Types & Interfaces
interface HeartbeatPayload {
    device_id: string;
    window_title: string;
    is_idle: boolean;
    heartbeat: boolean;
    timestamp: string;
    application: string;
}

interface HeartbeatRow {
    timestamp: string;
    is_idle: number; // SQLite treats booleans as 0 or 1
    application: string | null;
    window_title: string | null;
}

interface AppTimeResult {
    title: string;
    total_seconds: number;
}

/**
 * POST /api/heartbeat
 * Accepts tracking heartbeat data
 */
app.post('/api/heartbeat', (req: Request<{}, {}, HeartbeatPayload>, res: Response) => {
    const { device_id, window_title, is_idle, heartbeat, timestamp, application } = req.body;

    if (!device_id || !timestamp) {
        return res.status(400).json({ error: 'device_id and timestamp are required.' });
    }

    const query = `
        INSERT INTO heartbeats (device_id, window_title, is_idle, heartbeat, timestamp, application)
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
        query, 
        [device_id, window_title, is_idle, heartbeat, timestamp, application], 
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'Heartbeat recorded', id: this.lastID });
        }
    );
});

interface HeartbeatRow {
    device_id: string;
    application: string | null;
    window_title: string | null;
    is_idle: number; // SQLite stores booleans as 0 or 1
    timestamp: string;
}

/**
 * GET /api/heartbeats/:device_id
 * Fetches raw entries and calculates total active seconds per app in TypeScript.
 */
app.get('/api/heartbeats/:device_id', (req: Request<{ device_id: string }, {}, {}, { date?: string }>, res: Response) => {
    const { device_id } = req.params;
    const { date } = req.query;

    // 1. Fetch raw logs ordered chronologically (oldest to newest) to process sequence gaps accurately
    let query = `SELECT application, window_title, is_idle, timestamp FROM heartbeats WHERE device_id = ?`;
    const params: any[] = [device_id];

    if (date) {
        query += ` AND timestamp LIKE ?`;
        params.push(`${date}%`);
    }
    
    query += ` ORDER BY timestamp ASC`;

    db.all(query, params, (err, rows: HeartbeatRow[]) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // 2. Map tracking total seconds accumulator: { "VS Code": 120, "Chrome": 45 }
        const appDurations: Record<string, number> = {};

        // 3. Loop through rows and compare consecutive intervals
        for (let i = 0; i < rows.length - 1; i++) {
            const current = rows[i];
            const next = rows[i + 1];

            // Calculate time delta in seconds between current and next row
            const currentMs = new Date(current.timestamp).getTime();
            const nextMs = new Date(next.timestamp).getTime();
            const deltaSeconds = Math.floor((nextMs - currentMs) / 1000);

            // Ignore negative time hiccups or gaps greater than 5 minutes (300 seconds)
            if (deltaSeconds > 0 && deltaSeconds < 300) {
                const appName = current.application || current.window_title || 'Unknown';
                
                if (!appDurations[appName]) {
                    appDurations[appName] = 0;
                }
                appDurations[appName] += deltaSeconds;
            }
        }

        // 4. Transform key-value map into an ordered array format
        const result = Object.entries(appDurations)
            .map(([title, total_seconds]) => ({ title, total_seconds }))
            .sort((a, b) => b.total_seconds - a.total_seconds); // Highest duration first

        res.json(result);
    });
});

/**
 * 3. NEW: GET /api/heartbeats
 * Fetches ALL raw heartbeat records currently stored inside the database
 */
app.get('/api/heartbeats', (req: Request, res: Response) => {
    const query = `SELECT * FROM heartbeats ORDER BY timestamp DESC`;

    db.all(query, [], (err, rows: HeartbeatRow[]) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

/**
 * GET /api/devices
 * Returns a list of all distinct device IDs tracked in the database
 */
app.get('/api/devices', (req: Request, res: Response) => {
    const query = `
        SELECT DISTINCT device_id 
        FROM heartbeats 
        ORDER BY device_id ASC
    `;

    db.all(query, [], (err, rows: { device_id: string }[]) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Flatten the array of objects into a simple string array: ["macOS-B0427B24", "Windows-PC1"]
        const deviceIds = rows.map(row => row.device_id);
        
        res.json(deviceIds);
    });
});

app.listen(PORT, () => {
    console.log(`TypeScript server running on http://localhost:${PORT}`);
});
