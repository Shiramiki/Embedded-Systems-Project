// script.js (FINAL VERSION: ESP32 WebSocket & API)

// NOTE: Use this API_BASE constant when switching to dynamic mode
const API_BASE = 'http://localhost:3000/api'; 

// --- WEBSOCKET CONFIGURATION ---
const ESP32_GATEWAY = `ws://192.168.255.84/ws`;
let websocket;
let reconnectTimer = null; 

// --- CHART DATA ARRAYS ---
let timeLabels = [];
let tempHistory = [];
let humidHistory = [];
let bed1History = [];
let bed2History = [];
let bed3History = [];

// --- STATIC PLACEHOLDER DATA for Charts ---
const STATIC_LABELS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
const STATIC_BED1_DATA = [15, 18, 22, 20, 25, 27]; 
const STATIC_BED2_DATA = [10, 13, 17, 15, 20, 22];
const STATIC_BED3_DATA = [5, 8, 12, 10, 15, 17];
const STATIC_TEMP_DATA = [20.5, 22.0, 24.5, 23.0, 22.5, 21.0]; 
const STATIC_HUMID_DATA = [60, 55, 50, 58, 62, 65]; 

let soilMoistureChart, envChart;

// --- UTILITY FUNCTIONS ---

// Function to safely parse a string to a float, returning a default value (0) on failure
function safeParseFloat(str) {
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}

function getWeatherIconClass(iconCode) {
    const map = {
        '01d': 'fas fa-sun',
        '01n': 'fas fa-moon',
        '02d': 'fas fa-cloud-sun',
        '02n': 'fas fa-cloud-moon',
        '03d': 'fas fa-cloud',
        '04d': 'fas fa-cloud-meatball',
        '09d': 'fas fa-cloud-showers-heavy', 
        '10d': 'fas fa-cloud-sun-rain', 
        '11d': 'fas fa-bolt', 
        '13d': 'fas fa-snowflake', 
        '50d': 'fas fa-smog',
        'error': 'fas fa-exclamation-triangle'
    };
    return map[iconCode] || 'fas fa-cloud-sun-rain'; 
}

// ====================================================================
// --- 1. LIVE DATA & WEBSOCKET HANDLING ---
// ====================================================================

function initWebSocket() {
    console.log('Trying to open a WebSocket connection to: ' + ESP32_GATEWAY);
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.close();
    }
    
    websocket = new WebSocket(ESP32_GATEWAY);
    
    websocket.onopen    = onOpen;
    websocket.onclose   = onClose;
    websocket.onmessage = onMessage; 
    websocket.onerror   = onError;
}

function onOpen(event) {
    console.log('WebSocket Connection opened.');
    document.getElementById('ws-status-msg').textContent = 'Live data stream: CONNECTED';
    document.getElementById('ws-status-msg').style.backgroundColor = 'var(--color-success)';
}

function onClose(event) {
    console.log('WebSocket Connection closed. Retrying in 2 seconds...');
    document.getElementById('ws-status-msg').textContent = 'Live data stream: DISCONNECTED (Retrying...)';
    document.getElementById('ws-status-msg').style.backgroundColor = 'var(--color-warning)';
    
    reconnectTimer = setTimeout(initWebSocket, 2000); 
}

function onError(event) {
    console.error('WebSocket Error:', event);
}

// **B. MAIN DATA RECEIVING & RENDERING FUNCTION (Hardened and Fixed)**
function onMessage(event) {
    const rawData = event.data;
    
    // --- 1. DATA VALIDATION BLOCK (CRITICAL FIX FOR NaN) ---
    // Check if the data contains a comma and is long enough to be a valid packet.
    if (!rawData.includes(',') || rawData.length < 15) { 
        console.error("Received bad data packet, ignoring: " + rawData);
        document.getElementById('ws-status-msg').textContent = 'Live data stream: ERROR (Bad Packet)';
        document.getElementById('ws-status-msg').style.backgroundColor = 'var(--color-danger)';
        return; 
    }
    
    var dataArray = rawData.split(',');

    if (dataArray.length < 9) {
        console.error(`Received incomplete data. Expected 9 fields, got ${dataArray.length}: ${rawData}`);
        return; 
    }
    
    // --- 2. MAP AND SAFELY PARSE ---
    // Data order: time, temp, heatIndex, humidity, rain, WATER_STATUS_STRING, soil1, soil2, soil3
    var receivedTime   = dataArray[0]; 
    var temperature    = safeParseFloat(dataArray[1]); 
    var heatIndex      = safeParseFloat(dataArray[2]); 
    var humidity       = safeParseFloat(dataArray[3]); 
    var rainPercentage = safeParseFloat(dataArray[4]);
    
    // Index 5: Treat as a string (H/L/M/E status from ESP32)
    var waterStatus    = dataArray[5].trim().toUpperCase(); 
    
    var soil1Percent   = safeParseFloat(dataArray[6]);
    var soil2Percent   = safeParseFloat(dataArray[7]);
    var soil3Percent   = safeParseFloat(dataArray[8]);
    
    // --- 3. RENDER DATA ---
    document.getElementById('ws-status-msg').textContent = 'Live data stream: ACTIVE';
    document.getElementById('ws-status-msg').style.backgroundColor = 'var(--color-success)';

    document.getElementById('current-temp').textContent      = temperature.toFixed(1);
    document.getElementById('current-humidity').textContent  = `${humidity.toFixed(0)}%`;
    document.getElementById('heat-index').textContent        = heatIndex.toFixed(1); 
    document.getElementById('rain-percent').textContent      = `${rainPercentage.toFixed(0)}%`; 
    
    // Water level status (string)
    document.getElementById('water-level').textContent = waterStatus;
    
    // Raw ADC is not sent by the ESP32 in this scheme, so we leave it as a placeholder indicator
    document.getElementById('raw-value').textContent = "---"; 
    
    // Soil moisture updates
    document.getElementById('soil1-percent').textContent     = `${soil1Percent.toFixed(0)}%`; 
    document.getElementById('soil2-percent').textContent     = `${soil2Percent.toFixed(0)}%`; 
    document.getElementById('soil3-percent').textContent     = `${soil3Percent.toFixed(0)}%`; 
    
    document.getElementById('last-update').textContent = `Live: ${receivedTime}`;
    
    // ... (rest of chart logic) ...
}

// --- C. ASYNC FETCH FUNCTIONS (Weather/API) ---

async function fetchDataAndRender() {
    // ... (Weather and pump status logic remains the same) ...
    try {
        const apiData = { pump_status: false }; 
        const weatherRes = await fetch(`${API_BASE}/weather`);
        const weatherData = await weatherRes.json();

        // Pump Status Logic
        const pumpStatusSpan = document.getElementById('pump-status');
        const pumpSwitch = document.getElementById('pump-switch');
        if (apiData.pump_status) {
            pumpStatusSpan.textContent = 'PUMP ON (Manual Override)';
            pumpStatusSpan.style.backgroundColor = 'var(--color-danger)'; 
            pumpSwitch.checked = true;
        } else {
            pumpStatusSpan.textContent = 'AUTO-MODE ACTIVE';
            pumpStatusSpan.style.backgroundColor = 'var(--color-secondary)';
            pumpSwitch.checked = false;
        }

        // RENDER WEATHER DATA 
        const iconClass = getWeatherIconClass(weatherData.iconCode || '04d');
        const forecastIconElement = document.querySelector('.forecast-icon i');
        
        forecastIconElement.className = '';
        forecastIconElement.classList.add(...iconClass.split(' '));
        
        document.querySelector('.forecast-details .location').textContent = weatherData.location || "Mukono, UG";
        document.querySelector('.forecast-details .description').textContent = weatherData.description || "Loading...";
        document.querySelector('.forecast-details .temp').textContent = `${(weatherData.temp !== 'N/A' ? weatherData.temp.toFixed(1) : '--')} °C`;
        document.getElementById('rain-status-display').textContent = weatherData.rain_status.toUpperCase();
        
        document.getElementById('data-status-msg').textContent = 'Mukono weather successfully updated.';

    } catch (error) {
        console.error("Error fetching data from API:", error);
        document.getElementById('data-status-msg').textContent = 'ERROR: Check Server/API Key (Mukono forecast failed).';
        document.querySelector('.forecast-icon i').className = 'fas fa-exclamation-triangle';
        document.querySelector('.forecast-details .location').textContent = "Mukono, API Error";
        document.querySelector('.forecast-details .description').textContent = "Check API Key/Server";
    }
}

function updateLiveData() {
    fetchDataAndRender();
}


// ====================================================================
// --- 2. CHART DRAWING FUNCTIONS (Unchanged) ---
// ====================================================================

function updateCharts() {
    if (!soilMoistureChart) { 
        soilMoistureChart = createSoilMoistureChart(STATIC_LABELS, STATIC_BED1_DATA, STATIC_BED2_DATA, STATIC_BED3_DATA); 
    }
    if (!envChart) { 
        envChart = createEnvironmentalChart(STATIC_LABELS, STATIC_TEMP_DATA, STATIC_HUMID_DATA); 
    }
}
// ... (Your existing chart option functions remain here) ...
const staticChartOptions = {
    responsive: false, 
    maintainAspectRatio: false, 
    plugins: { 
        legend: { 
            labels: { 
                color: '#fff',
                font: {
                    size: 12
                }
            } 
        } 
    },
    scales: {
        y: { 
            title: { 
                display: true, 
                text: 'Value', 
                color: '#ccc' 
            }, 
            grid: { 
                color: 'rgba(255, 255, 255, 0.1)' 
            }, 
            ticks: { 
                color: '#ccc' 
            } 
        },
        x: { 
            grid: { 
                display: false 
            }, 
            ticks: { 
                color: '#ccc' 
            } 
        }
    }
};

function createSoilMoistureChart(labels, d1, d2, d3) {
    const ctx = document.getElementById('soilMoistureChart');
    if (!ctx) return null;
    
    const canvas = ctx.getContext('2d');
    const options = JSON.parse(JSON.stringify(staticChartOptions));
    options.scales.y.title.text = 'Moisture (%)';
    options.scales.x.grid.display = true;
    
    return new Chart(canvas, { 
        type: 'line', 
        data: { 
            labels: labels, 
            datasets: [
                { 
                    label: 'Bed 1 (C1)', 
                    data: d1, 
                    borderColor: '#00bcd4', 
                    backgroundColor: 'rgba(0, 188, 212, 0.1)',
                    tension: 0.4, 
                    fill: true 
                },
                { 
                    label: 'Bed 2 (C2)', 
                    data: d2, 
                    borderColor: '#00e676', 
                    backgroundColor: 'rgba(0, 230, 118, 0.1)',
                    tension: 0.4, 
                    fill: true 
                },
                { 
                    label: 'Bed 3 (C3)', 
                    data: d3, 
                    borderColor: '#ffb300', 
                    backgroundColor: 'rgba(255, 179, 0, 0.1)',
                    tension: 0.4, 
                    fill: true 
                }
            ]
        }, 
        options: options 
    });
}

function createEnvironmentalChart(labels, temp, humid) {
    const ctx = document.getElementById('envChart');
    if (!ctx) return null;
    
    const canvas = ctx.getContext('2d');
    const options = JSON.parse(JSON.stringify(staticChartOptions));
    
    options.scales = {
        yTemp: {
            type: 'linear',
            position: 'left',
            title: { 
                display: true, 
                text: 'Temp (°C)', 
                color: '#ccc' 
            },
            grid: { 
                color: 'rgba(255, 255, 255, 0.1)' 
            },
            ticks: { 
                color: '#ccc' 
            },
            min: 15,
            max: 30
        },
        yHum: {
            type: 'linear',
            position: 'right',
            title: { 
                display: true, 
                text: 'Humidity (%)', 
                color: '#ccc' 
            },
            grid: { 
                display: false 
            },
            ticks: { 
                color: '#ccc' 
            },
            min: 40,
            max: 80
        },
        x: { 
            grid: { 
                display: true,
                color: 'rgba(255, 255, 255, 0.05)'
            }, 
            ticks: { 
                color: '#ccc' 
            } 
        }
    };
    
    return new Chart(canvas, { 
        type: 'line', 
        data: { 
            labels: labels, 
            datasets: [
                { 
                    label: 'Temperature (°C)', 
                    data: temp, 
                    borderColor: '#ff5252', 
                    backgroundColor: 'rgba(255, 82, 82, 0.1)',
                    yAxisID: 'yTemp', 
                    tension: 0.2, 
                    fill: true 
                },
                { 
                    label: 'Humidity (%)', 
                    data: humid, 
                    borderColor: '#00bcd4', 
                    backgroundColor: 'rgba(0, 188, 212, 0.1)',
                    yAxisID: 'yHum', 
                    tension: 0.2, 
                    fill: true 
                }
            ]
        }, 
        options: options 
    });
}

// ====================================================================
// --- 3. INTERACTIVITY (FILE DOWNLOAD FIX) ---
// ====================================================================

// ====================================================================
// --- 3. INTERACTIVITY (FINAL CLEANUP) ---
// ====================================================================

function setupInteractivity() {
    // --- Element Selection ---
    const statusMsg = document.getElementById('data-status-msg');
    const pumpStatusSpan = document.getElementById('pump-status');
    const pumpSwitch = document.getElementById('pump-switch');
    const csvInput = document.getElementById('sd-csv-input'); 
    const appendBtn = document.getElementById('append-db-btn');
    const uploadBtn = document.getElementById('upload-csv-btn');

    
    
    // --- Pump Slider Control Logic (Restored original 'if' statements as they were in your input) ---
    if (pumpSwitch) {
        pumpSwitch.addEventListener('change', (e) => { 
            const isManualOn = e.target.checked;

            if (isManualOn) {
                pumpStatusSpan.textContent = 'PUMP ON (Manual Override)';
                pumpStatusSpan.style.backgroundColor = 'var(--color-danger)';
            } else {
                pumpStatusSpan.textContent = 'AUTO-MODE ACTIVE';
                pumpStatusSpan.style.backgroundColor = 'var(--color-secondary)';
            }
            statusMsg.textContent = `Pump control command sent. Backend connection required for real action.`; 
        });
    }
    
    
    // --- Data Management Buttons ---
    
    // 💥 FIX 1: Re-purpose "Upload SD Card CSV" button to trigger LOCAL file selection
    if (uploadBtn && csvInput) {
        uploadBtn.addEventListener('click', (e) => { 
            // We prevent the default download and trigger the file input instead
            e.preventDefault(); 
            csvInput.click(); // <<< Opens the local file dialog
            statusMsg.textContent = 'Please select the downloaded CSV file.';
        });
    }
    
    // 💥 FIX 2: Handle file selection, store the file, and ENABLE the Append button
    if (csvInput && appendBtn) {
        csvInput.addEventListener('change', async (e) => {
            // NOTE: 'uploadedFile' must be declared globally (let uploadedFile = null;)
            uploadedFile = e.target.files[0]; 
            
            if (uploadedFile) {
                statusMsg.textContent = `File selected: ${uploadedFile.name}. Click 'Append Data' to process.`;
                appendBtn.disabled = false; // <<< ENABLES THE APPEND BUTTON
            } else {
                statusMsg.textContent = 'File selection cancelled or failed.';
                appendBtn.disabled = true;
            }
        });
    }

    // 💥 FIXED APPEND BUTTON LOGIC (Ready to receive the file)
    if (appendBtn) {
        appendBtn.addEventListener('click', async () => { 
            // Check for file availability (this check should pass if the button was correctly enabled)
            if (typeof uploadedFile === 'undefined' || !uploadedFile) {
                statusMsg.textContent = 'Please select a CSV file first using the Upload button.';
                return;
            }
            
            statusMsg.textContent = `Sending ${uploadedFile.name} to API for appending...`;
            
            const formData = new FormData();
            formData.append('csvFile', uploadedFile); 
            
            try {
                // Targeting the correct API endpoint for local file uploads
                const response = await fetch(`${API_BASE}/upload-csv`, {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    statusMsg.textContent = `✅ Append successful: ${result.message}`;
                    uploadedFile = null; 
                    appendBtn.disabled = true;
                } else {
                    statusMsg.textContent = `❌ Append failed: ${result.message || 'Server error.'}`;
                }
            } catch (error) {
                console.error('API Append error:', error);
                statusMsg.textContent = '❌ Network error: Check if your external API server is running at http://localhost:3000';
            }
        });
    }
    // --- Rest of the Data Management Buttons (Export, Download, Delete) ---

    // 2. FIX: Export FULL Database CSV button now calls the API and forces a download
    const exportBtn = document.getElementById('export-db-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            statusMsg.textContent = 'Initiating database export...';
            
            try {
                const response = await fetch(`${API_BASE}/export-db-csv`);
                
                if (response.ok) {
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = 'svris_database_export.csv';
                    
                    if (contentDisposition) {
                        const match = contentDisposition.match(/filename="(.+?)"/);
                        if (match) filename = match[1];
                    }
                    
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    statusMsg.textContent = `Database export successful! File (${filename}) downloaded.`;
                } else if (response.status === 404) {
                    statusMsg.textContent = 'Export failed: Database is empty (404).';
                } else {
                    const errorData = await response.json();
                    statusMsg.textContent = `Export failed: ${errorData.message || 'Server error.'}`;
                }
            } catch (error) {
                console.error('Export error:', error);
                statusMsg.textContent = 'Export failed due to network or server connectivity issue.';
            }
        });
    }
    
    // 3. Download SD Card CSV (Hardware Required) is now advisory
    const downloadSdBtn = document.getElementById('download-sd-btn');

    if (downloadSdBtn) {

        downloadSdBtn.addEventListener('click', () => {

            statusMsg.textContent = 'Initiating direct file download...';

           

            // 1. Create a temporary, hidden anchor element

            const a = document.createElement('a');

           

            // 2. Set the href directly to the working ESP32 download endpoint

            a.href = "http://192.168.255.84/download-sd-csv";

           

            // 3. Set the 'download' attribute

            a.download = 'svris_sd_data_export.csv';

           

            // 4. Trigger the download

            document.body.appendChild(a);

            a.click();

            document.body.removeChild(a);

           

            // 5. Update status display (synchronous)

            setTimeout(() => {

                statusMsg.textContent = 'SD Card CSV download initiated successfully!';

            }, 500);

        });

    }
}

// ====================================================================
// --- 4. INITIALIZATION (Unchanged) ---
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Establish the real-time connection FIRST
    initWebSocket();
    
    // 2. Initialize the non-live parts (Charts, Interactivity)
    updateCharts();
    setupInteractivity();
    
    // 3. Fetch external data (like weather) periodically
    fetchDataAndRender(); 
    setInterval(fetchDataAndRender, 600000); // Refresh weather/API data every 10 minutes
    
    // 4. Initial status message
    document.getElementById('data-status-msg').textContent = 'Dashboard initialized. Fetching weather...';
    // Add a status message element for the WS connection (you'll need to add this ID to your HTML)
    document.getElementById('ws-status-msg').textContent = 'Live data stream: CONNECTING...';
    document.getElementById('ws-status-msg').style.backgroundColor = 'var(--color-primary)';
});