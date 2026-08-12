import { Pool } from "pg";
import dotenv from "dotenv";

// configure environment variables
dotenv.config();

const pool = new Pool({
    user: process.env.user,
    host: process.env.host,
    database: process.env.database,
    password: process.env.password,
    port: process.env.port_db,
    // Add connection pool configuration
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
    // Add SSL configuration for production
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Add error handling for the pool
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Add connection event logging (only in development)
if (process.env.NODE_ENV === 'development') {
    pool.on('connect', (client) => {
        console.log('New client connected to database');
    });

    pool.on('acquire', (client) => {
        console.log('Client acquired from pool');
    });

    pool.on('release', (client) => {
        console.log('Client released back to pool');
    });
}

export default pool;