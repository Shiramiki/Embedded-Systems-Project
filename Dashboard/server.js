// server.js (FINAL VERSION with CSV Upload/Append Fixes)

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer'); 
const { parse } = require('csv-parse'); 
const axios = require('axios'); 

const app = express();
const PORT = 3000;

// --- CONFIGURATION ---

const dbPool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: 'Rachel@UcU2023', 
    database: 'svris_db',
    waitForConnections: true,
    connectionLimit: 10,
});

// Middleware
app.use(cors()); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); 
const upload = multer({ dest: 'uploads/' });

// --- API ENDPOINTS ---
// ... (Your existing endpoints: /api/live-data, /api/chart-data, /api/weather, /api/control-pump) ...


// 💥 FIX: /api/upload-csv endpoint now correctly maps ESP32 headers to DB columns
app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ 
            success: false, 
            message: 'No file uploaded.' 
        });
    }
    
    const filePath = req.file.path;
    console.log('Processing CSV file:', filePath);
    
    try {
        const csvData = fs.readFileSync(filePath, 'utf-8');
        
        // --- 1. Define CSV Headers for Mapping ---
        // These are the internal names used by the 'csv-parse' library, 
        // mapped positionally to the data columns in your uploaded CSV:
        // CSV: Timestamp, Temperat, HeatIndex, Humidity(, Rain, WaterLev, Soil1(%), Soil2(%), Soil3(%)
        const ESP32_CSV_HEADERS = [
            'Timestamp', 
            'Temperature_C', 
            'HeatIndex', 
            'Humidity_Perc', 
            'Rain_Value', 
            'WaterLevel_Raw', // Raw ADC value (210 in your example)
            'Soil1_Perc', 
            'Soil2_Perc', 
            'Soil3_Perc'
        ];
        
        const records = await new Promise((resolve, reject) => {
            const parsedRecords = [];
            
            // Use stream parser for large files, reading from the temporary file path
            fs.createReadStream(filePath)
                .pipe(
                    parse({ 
                        columns: ESP32_CSV_HEADERS, // Use our defined headers
                        from_line: 2,               // Skip the actual first header line from the ESP32 file
                        skip_empty_lines: true,
                        trim: true,
                        auto_parse: true // Automatically converts strings to numbers/booleans
                    })
                )
                .on('data', (record) => parsedRecords.push(record))
                .on('end', () => resolve(parsedRecords))
                .on('error', (error) => reject(error));
        });
        
        // --- 2. Database Insertion ---
        
        let insertedCount = 0;
        let errorCount = 0;
        const errors = [];
        
        // Start a transaction for safety
        const connection = await dbPool.getConnection();
        await connection.beginTransaction();

        try {
            // 💥 FIX 2: Update INSERT query to match `schema.sql` column names!
            const query = `
                INSERT INTO sensor_data (
                    timestamp, temp_c, humidity_perc, 
                    soil1_perc, soil2_perc, soil3_perc, 
                    heat_index, water_status, rain_perc
                ) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            for (const [index, record] of records.entries()) {
                try {
                    // Simple water level mapping logic for the 'water_status' column (VARCHAR(1)):
                    let waterStatus;
                    const rawLevel = record.WaterLevel_Raw;
                    
                    if (rawLevel >= 200) {
                        waterStatus = 'H'; // High
                    } else if (rawLevel > 100) {
                        waterStatus = 'M'; // Medium
                    } else if (rawLevel > 0) {
                        waterStatus = 'L'; // Low
                    } else {
                        waterStatus = 'E'; // Error/Empty
                    }
                    
                    // 💥 FIX 3: Map the parsed CSV data fields to the corrected MySQL table columns:
                    const values = [
                        record.Timestamp, 
                        record.Temperature_C, // maps to temp_c
                        record.Humidity_Perc, // maps to humidity_perc
                        record.Soil1_Perc,    // maps to soil1_perc
                        record.Soil2_Perc, 
                        record.Soil3_Perc,
                        record.HeatIndex,
                        waterStatus,          // maps to water_status (H/M/L/E string)
                        record.Rain_Value     // maps to rain_perc (e.g., 0 or 10.0)
                    ];
                    
                    await connection.execute(query, values);
                    insertedCount++;
                } catch (rowError) {
                    errorCount++;
                    errors.push(`Row ${index + 1}: ${rowError.message}`);
                    console.error(`Error inserting row ${index + 1}:`, rowError.message);
                }
            }
            
            await connection.commit();
            
        } catch (transactionError) {
            await connection.rollback();
            throw transactionError; // Re-throw to be caught by outer catch block
        } finally {
            connection.release(); // Release connection back to pool
        }
        
        // --- 3. Final Cleanup and Response ---
        fs.unlinkSync(filePath); // Clean up temp file
        
        if (errorCount > 0) {
            res.json({ 
                success: true, 
                message: `CSV partially processed. ${insertedCount} rows inserted, ${errorCount} errors.`,
                errors: errors.slice(0, 5) 
            });
        } else {
            res.json({ 
                success: true, 
                message: `Successfully uploaded CSV. ${insertedCount} rows appended to database.` 
            });
        }
    } catch (error) {
        console.error('Error processing CSV:', error);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.status(500).json({ 
            success: false,
            message: 'Failed to process and append data. Check CSV format or server log.',
            error: error.message 
        });
    }
});
// server.js (NEW ENDPOINT ADDITION)
// Place this new endpoint near your existing /api/upload-csv endpoint

c// server.js (UPDATED /api/append-from-esp32 endpoint)

// NOTE: Ensure the ESP32_DATA_SOURCE_URL is defined globally or above this function,
// matching the style of API_BASE. I will place it outside the handler function.
const ESP32_DATA_SOURCE_URL = 'http://192.168.255.84/download-sd-csv';


// server.js (CONFIRMED CORRECT /api/append-from-esp32 endpoint)

// NOTE: Assume these variables/imports are defined globally/above this function:
// const axios = require('axios');
// const { parse } = require('csv-parse');
// const ESP32_DATA_SOURCE_URL = 'http://192.168.255.84/download-sd-csv';
// const dbPool = mysql.createPool({...});
// const app = express();


app.post('/api/append-from-esp32', async (req, res) => {
    
    // NOTE: These headers MUST match the order of data in your ESP32 CSV file
    const ESP32_CSV_HEADERS = [
        'Timestamp', 
        'Temperature_C', 
        'HeatIndex', 
        'Humidity_Perc', 
        'Rain_Value', 
        'WaterLevel_Raw',
        'Soil1_Perc', 
        'Soil2_Perc', 
        'Soil3_Perc'
    ];
    
    try {
        // 1. Fetch CSV data directly from the ESP32
        const response = await axios.get(ESP32_DATA_SOURCE_URL);
        const csvData = response.data;

        if (!csvData || csvData.length === 0) {
            return res.status(404).json({ success: false, message: 'No data received from ESP32 endpoint.' });
        }
        
        // 2. Parse the CSV data
        const records = await new Promise((resolve, reject) => {
            const parsedRecords = [];
            parse(csvData, { 
                columns: ESP32_CSV_HEADERS, 
                from_line: 2, // Skip the header row from the ESP32 file
                skip_empty_lines: true,
                trim: true,
                auto_parse: true 
            })
            .on('data', (record) => parsedRecords.push(record))
            .on('end', () => resolve(parsedRecords))
            .on('error', (error) => reject(error));
        });

        // 3. Database Insertion (Uses your existing database column mapping)
        let insertedCount = 0;
        let errorCount = 0;
        const connection = await dbPool.getConnection();
        await connection.beginTransaction();

        try {
            // Ensure this query column order matches your schema.sql:
            const query = `
                INSERT INTO sensor_data (
                    timestamp, temp_c, humidity_perc, 
                    soil1_perc, soil2_perc, soil3_perc, 
                    heat_index, water_status, rain_perc
                ) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            // The fixed iteration logic (for...of)
            for (const record of records) {
                try {
                    // Mapping logic from CSV fields (WaterLevel_Raw) to DB column (water_status)
                    let waterStatus = 'E';
                    const rawLevel = record.WaterLevel_Raw;
                    if (rawLevel >= 200) waterStatus = 'H';
                    else if (rawLevel > 100) waterStatus = 'M';
                    else if (rawLevel > 0) waterStatus = 'L';
                    
                    const values = [
                        record.Timestamp, 
                        record.Temperature_C, 
                        record.Humidity_Perc,
                        record.Soil1_Perc, 
                        record.Soil2_Perc, 
                        record.Soil3_Perc,
                        record.HeatIndex,
                        waterStatus,
                        record.Rain_Value 
                    ];
                    
                    await connection.execute(query, values);
                    insertedCount++;
                } catch (rowError) {
                    errorCount++;
                    console.error('Error inserting row:', rowError.message);
                }
            }
            
            await connection.commit();
            
        } catch (transactionError) {
            await connection.rollback();
            // Logging the rollback is useful for diagnostics
            console.error('Transaction rolled back due to error:', transactionError.message); 
            throw transactionError; 
        } finally {
            connection.release();
        }
        
        // 4. Final Response
        const responseMessage = (errorCount > 0) 
            ? `CSV partially processed. ${insertedCount} rows inserted, ${errorCount} errors. Please check server logs.`
            : `Successfully appended ${insertedCount} rows from ESP32.`;

        res.json({ success: true, message: responseMessage });

    } catch (error) {
        // Catch-all for Axios fetch errors or major parsing/transaction errors
        console.error('Server side fetch/process error:', error.message);
        res.status(500).json({ 
            success: false,
            message: `Failed to fetch or process data: ${error.message}`
        });
    }
});

// ... (Your existing endpoints: /api/export-db-csv, /api/health, error handling, and server start logic remain unchanged) ...