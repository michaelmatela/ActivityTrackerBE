AI Prompt

I need a backend written with node js must be in typescript express and sql lite db

accept this in post

["device_id": "macOS-B0427B24", "window_title": "Unknown Window", "is_idle": true, "heartbeat": true, "timestamp": "2026-07-19T19:18:43Z", "application": "Calculator"] 

AI Answer

Here is a clean, robust setup for a Node.js backend using TypeScript, Express, and SQLite (sqlite3 paired with sqlite for async/await support).

First, a quick detail on your payload: your example uses bracket notation with key-value pairs (["key": "value"]), which is invalid JSON. I have updated the implementation to expect a standard JSON object ({"key": "value"}).

Project Setup
Run these commands in your terminal to initialize the project and install the required dependencies:

mkdir heartbeat-backend && cd heartbeat-backend
npm init -y
npm install express sqlite3 sqlite dotenv
npm install --save-dev typescript @types/express @types/node ts-node
npx tsc --init

1. Database Initialization (database.ts)
This file handles the connection and ensures the table exists. SQLite stores data locally in a .db file.

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

let db: Database;

export async function initDatabase(): Promise<Database> {
  db = await open({
    filename: './heartbeats.db',
    driver: sqlite3.Database
  });

  // Create the table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      window_title TEXT,
      is_idle INTEGER, -- SQLite uses 0/1 for booleans
      heartbeat INTEGER,
      timestamp TEXT NOT NULL,
      application TEXT
    )
  `);

  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

2. The Express Server (server.ts)
This sets up the endpoint, enforces TypeScript interfaces for your payload, and handles inserting the data.

import express, { Request, Response } from 'express';
import { initDatabase, getDb } from './database';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse standard JSON payloads
app.use(express.json());

// Type definition matching your exact payload structure
interface HeartbeatPayload {
  device_id: string;
  window_title: string;
  is_idle: boolean;
  heartbeat: boolean;
  timestamp: string;
  application: string;
}

// POST endpoint to receive data
app.post('/api/heartbeat', async (req: Request<{}, {}, HeartbeatPayload>, res: Response): Promise<void> => {
  try {
    const { device_id, window_title, is_idle, heartbeat, timestamp, application } = req.body;

    // Quick validation
    if (!device_id || !timestamp) {
       res.status(400).json({ error: "Missing required fields: device_id and timestamp" });
       return;
    }

    const db = getDb();

    // Insert statement converting booleans to 1 or 0 for SQLite compatibility
    const query = `
      INSERT INTO heartbeats (device_id, window_title, is_idle, heartbeat, timestamp, application)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    await db.run(query, [
      device_id,
      window_title,
      is_idle ? 1 : 0,
      heartbeat ? 1 : 0,
      timestamp,
      application
    ]);

    res.status(201).json({ status: "success", message: "Heartbeat recorded successfully." });
  } catch (error) {
    console.error("Database insertion error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Initialize database then start the server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

AI Prompt 2
now add a get all to test the post

AI Answer 2

Here is the updated server.ts file with a GET endpoint added to fetch all recorded heartbeats.

Because SQLite doesn't have a native boolean type, it returns the is_idle and heartbeat fields as 1 or 0. I added a quick .map() step in the GET route to convert those values back into proper JavaScript booleans (true/false) so the response matches your original payload structure perfectly.

// 2. GET Endpoint: Fetch all recorded heartbeats
app.get('/api/heartbeats', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb();
    
    // Query all entries, sorting by the newest entries first
    const rows = await db.all('SELECT * FROM heartbeats ORDER BY id DESC');

    // Map over rows to cast 1/0 integers back to proper booleans
    const formattedRows = rows.map(row => ({
      ...row,
      is_idle: row.is_idle === 1,
      heartbeat: row.heartbeat === 1
    }));

    res.status(200).json(formattedRows);
  } catch (error) {
    console.error("Database retrieval error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

AI Prompt 3

I need to fetch all devices as array of string

AI Answer 3

Here is a new GET endpoint to retrieve a distinct list of all device IDs as a flat array of strings.

You can add this route directly into your server.ts file right alongside the previous endpoints. It uses SQLite's DISTINCT keyword to filter out duplicates so each device is only listed once.

Add this to server.ts

// 3. GET Endpoint: Fetch all unique device IDs as a flat array of strings
app.get('/api/devices', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDb();
    
    // Query only unique device IDs from the table
    const rows = await db.all<{ device_id: string }[]>('SELECT DISTINCT device_id FROM heartbeats');

    // Extract the strings from the raw object rows into a flat array
    const deviceIds = rows.map(row => row.device_id);

    res.status(200).json(deviceIds);
  } catch (error) {
    console.error("Database retrieval error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

AI Prompt 4

I need a query for deviceid and optional date for timestamp then process them in typescript to summation of timestamp

data should be application then duration

AI Answer 4

To calculate the total application duration per device, we need to track the time elapsed between consecutive heartbeat timestamps. Because SQLite stores these as text, the most accurate way to handle this is to query the logs chronologically for a specific device, then compute the millisecond differences sequentially in TypeScript.

Here is the new GET endpoint. It accepts a required device_id path parameter and an optional date query parameter (e.g., ?date=2026-07-19) to filter logs for a specific day.

Add this to server.ts

// GET Endpoint: Sum application durations for a specific device (and optional date)
// Example usage: /api/devices/macOS-B0427B24/duration?date=2026-07-19
app.get('/api/devices/:deviceId/duration', async (req: Request, res: Response): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const { date } = req.query; // Format expected: YYYY-MM-DD

    const db = getDb();
    
    let query = `
      SELECT application, timestamp 
      FROM heartbeats 
      WHERE device_id = ?
    `;
    const params: any[] = [deviceId];

    // If an optional date filter is provided, match timestamps starting with that date string
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      query += ` AND timestamp LIKE ?`;
      params.push(`${date}%`);
    }

    // Crucial: order chronologically so we can compute intervals accurately
    query += ` ORDER BY timestamp ASC`;

    const logs = await db.all<{ application: string; timestamp: string }[]>(query, params);

    if (logs.length === 0) {
      res.status(200).json({});
      return;
    }

    // Dictionary to accumulate durations in milliseconds: { [applicationName]: totalMs }
    const durationMap: Record<string, number> = {};

    // Max gap threshold: If heartbeats are separated by more than 5 minutes (300,000 ms),
    // assume the machine went to sleep or the app stopped, rather than counting it as active time.
    const MAX_GAP_MS = 5 * 60 * 1000; 
    // Fallback interval: If a lone heartbeat occurs, assume it covers a brief baseline frame (e.g., 30s)
    const ASSUMED_HEARTBEAT_INTERVAL_MS = 30 * 1000;

    for (let i = 0; i < logs.length; i++) {
      const currentLog = logs[i];
      const currentMs = new Date(currentLog.timestamp).getTime();
      const currentApp = currentLog.application || "Unknown Application";

      if (i < logs.length - 1) {
        const nextLog = logs[i + 1];
        const nextMs = new Date(nextLog.timestamp).getTime();
        const diffMs = nextMs - currentMs;

        // Ensure the time delta is logical and within a reasonable tracking window
        if (diffMs > 0 && diffMs <= MAX_GAP_MS) {
          durationMap[currentApp] = (durationMap[currentApp] || 0) + diffMs;
        } else {
          // Normal fallback for tracking gaps or edge log cases
          durationMap[currentApp] = (durationMap[currentApp] || 0) + ASSUMED_HEARTBEAT_INTERVAL_MS;
        }
      } else {
        // Last log item: append baseline interval since there is no sequential log to compare against
        durationMap[currentApp] = (durationMap[currentApp] || 0) + ASSUMED_HEARTBEAT_INTERVAL_MS;
      }
    }

    // Format millisecond accumulations into human-readable strings (e.g., "1h 14m 32s")
    const formattedResult: Record<string, string> = {};
    for (const [app, totalMs] of Object.entries(durationMap)) {
      const totalSeconds = Math.floor(totalMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const parts: string[] = [];
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);

      formattedResult[app] = parts.join(' ');
    }

    res.status(200).json(formattedResult);
  } catch (error) {
    console.error("Duration calculation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

