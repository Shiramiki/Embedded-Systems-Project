// app.js (Styled and Functional)

const API_BASE_URL = '/api'; 
const PRIMARY_COLOR = '#00E4A1'; 
const SECONDARY_COLOR = '#999999'; 

// --- CHART UTILITY FUNCTIONS & INITIALIZATION ---

function getChartOptions(yAxisConfig = {}) {
    return {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#FFFFFF', boxWidth: 10 } } },
        scales: {
            x: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#FFFFFF' } },
            ...yAxisConfig 
        }
    };
}

// 1. Soil Moisture Chart
const moistureCtx = document.getElementById('moistureChart').getContext('2d');
let moistureChart = new Chart(moistureCtx, {
    type: 'line', data: { labels: [], datasets: [
        { label: 'Bed 1', data: [], borderColor: PRIMARY_COLOR, tension: 0.4, borderWidth: 2.5 },
        { label: 'Bed 2', data: [], borderColor: '#2196F3', tension: 0.4, borderWidth: 2.5 },
        { label: 'Bed 3', data: [], borderColor: '#FF9800', tension: 0.4, borderWidth: 2.5 }
    ]},
    options: getChartOptions({ y: { grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#FFFFFF' }, title: { display: true, text: 'Moisture Level (%)', color: SECONDARY_COLOR } } })
});

// 2. Temp/Humidity Chart
const tempHumidCtx = document.getElementById('tempHumidChart').getContext('2d');
let tempHumidChart = new Chart(tempHumidCtx, {
    type: 'line', data: { labels: [], datasets: [
        { label: 'Temperature (°C)', data: [], yAxisID: 'temp', borderColor: '#E3342F', tension: 0.4, fill: false, borderWidth: 2.5 },
        { label: 'Humidity (%)', data: [], yAxisID: 'humid', borderColor: '#2196F3', tension: 0.4, fill: false, borderWidth: 2.5 }
    ]},
    options: getChartOptions({
        temp: { type: 'linear', position: 'left', id: 'temp', title: { display: true, text: 'Temp (°C)', color: '#E3342F' }, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#FFFFFF' } },
        humid: { type: 'linear', position: 'right', id: 'humid', title: { display: true, text: 'Humidity (%)', color: '#2196F3' }, grid: { drawOnChartArea: false }, ticks: { color: '#FFFFFF' } }
    })
});

// 3. Rain Comparison Chart
const rainCtx = document.getElementById('rainCompareChart').getContext('2d');
let rainCompareChart = new Chart(rainCtx, {
    type: 'bar', data: { labels: [], datasets: [
        { label: 'API Rain Chance (%)', data: [], backgroundColor: 'rgba(30, 144, 255, 0.7)', barPercentage: 0.5, categoryPercentage: 0.6 },
        { label: 'System Rain Detected', data: [], backgroundColor: 'rgba(56, 193, 114, 0.7)', yAxisID: 'yRain', barPercentage: 0.5, categoryPercentage: 0.6 }
    ]},
    options: getChartOptions({
        y: { type: 'linear', position: 'left', title: { display: true, text: 'Rain Chance (%)', color: SECONDARY_COLOR }, max: 100, min: 0, grid: { color: 'rgba(255, 255, 255, 0.1)' }, ticks: { color: '#FFFFFF' } },
        yRain: { type: 'linear', position: 'right', title: { display: true, text: 'System Detection (1/0)', color: SECONDARY_COLOR }, max: 1.1, min: 0, stepSize: 1, grid: { drawOnChartArea: false }, ticks: { color: '#FFFFFF' } }
    })
});

// --- LIVE DATA & CONTROL FUNCTIONS ---

async function fetchLiveData() {
    try {
        const response = await fetch(`${API_BASE_URL}/status/live`);
        const data = await response.json();
        
        document.getElementById('temp-display').textContent = `${data.temperature} °C`;
        document.getElementById('hum-display').textContent = `${data.humidity} %`;
        document.getElementById('level-display').textContent = `${data.water_level} %`;
        
        const pumpToggle = document.getElementById('pump-toggle-btn');
        const pumpStatusDisplay = document.getElementById('pump-status-display');
        
        pumpToggle.checked = data.pump_status; 
        pumpToggle.setAttribute('data-status', data.pump_status ? 1 : 0);

        pumpStatusDisplay.textContent = data.pump_status ? 'ACTIVE' : 'INACTIVE';
        pumpStatusDisplay.className = data.pump_status ? 'badge status-badge-active' : 'badge status-badge-inactive';
        document.getElementById('rain-display').textContent = data.rain_status ? 'DETECTED' : 'NO';

    } catch (error) {
        console.error("Error fetching live data:", error);
    }
}

document.getElementById('pump-toggle-btn').addEventListener('change', async (event) => {
    const btn = event.target;
    const newStatus = btn.checked ? 1 : 0;
    try {
        const response = await fetch(`${API_BASE_URL}/control/pump`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus })
        });
        if (response.ok) { fetchLiveData(); } else { alert('Failed to send pump control command.'); btn.checked = !btn.checked; }
    } catch (error) {
        alert('Communication error with the server.'); btn.checked = !btn.checked;
    }
});

// --- LOCATION & WEATHER FUNCTIONS ---

async function fetchLocationAndWeather() {
    try {
        const locResponse = await fetch(`${API_BASE_URL}/location`);
        const userLocation = await locResponse.json();
        document.getElementById('current-location').textContent = `Location: ${userLocation.city}, ${userLocation.country}`;

        const weatherResponse = await fetch(`${API_BASE_URL}/weather/forecast?lat=${userLocation.lat}&lon=${userLocation.lon}`);
        const data = await weatherResponse.json();

        document.getElementById('weather-api-data').innerHTML = `
            <p class="mb-1"><strong>Location:</strong> ${data.location}</p>
            <h4 style="color: ${PRIMARY_COLOR};">${data.current}</h4>
            <p><strong>Temperature:</strong> ${data.temp}</p>
            <p><strong>Humidity:</strong> ${data.humidity}</p>
            <p><strong>Rain Chance:</strong> <span class="badge bg-primary">${data.rain_chance}</span></p>
        `;

    } catch (error) {
        document.getElementById('weather-api-data').innerHTML = '<p class="text-danger">Could not load forecast.</p>';
    }
}
// --- Inside your fetchLiveData() function in app.js ---

async function fetchLiveData() {
    try {
        const response = await fetch(`${API_BASE_URL}/status/live`);
        const data = await response.json();
        
        // Existing updates:
        document.getElementById('temp-display').textContent = `${data.temperature} °C`;
        document.getElementById('hum-display').textContent = `${data.humidity} %`;
        document.getElementById('level-display').textContent = `${data.water_level} %`;
        
        // NEW UPDATES FOR SOIL MOISTURE:
        document.getElementById('moisture-1-display').textContent = data.moisture_bed_1;
        document.getElementById('moisture-2-display').textContent = data.moisture_bed_2;
        document.getElementById('moisture-3-display').textContent = data.moisture_bed_3;
        
        // UPDATED RAIN STATUS:
        const rainStatusText = data.rain_status ? 'DETECTED' : 'NO';
        document.getElementById('rain-display').textContent = rainStatusText;
        document.getElementById('rain-display').className = data.rain_status ? 'badge bg-success float-end' : 'badge bg-info float-end';
        
        // ... (The rest of the function for pump status remains the same)
        
    } catch (error) {
        // ... (Error handling remains the same)
    }
}

// --- CHART DATA FETCHING & UPDATING ---

async function updateCharts() {
    try {
        const response = await fetch(`${API_BASE_URL}/data/historical`);
        if (!response.ok) throw new Error("API call failed");
        
        const data = await response.json(); 
        if (data.length === 0) return;

        // Process Data Arrays
        const labels = data.map(item => new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        const bed1Data = data.map(item => item.moisture_bed_1);
        const bed2Data = data.map(item => item.moisture_bed_2);
        const bed3Data = data.map(item => item.moisture_bed_3);
        const tempData = data.map(item => item.temperature);
        const humidData = data.map(item => item.humidity);
        const rainStatusData = data.map(item => item.rain_status ? 1 : 0);
        
        // Update Charts
        moistureChart.data.labels = labels; moistureChart.data.datasets[0].data = bed1Data; moistureChart.data.datasets[1].data = bed2Data; moistureChart.data.datasets[2].data = bed3Data; moistureChart.update();
        tempHumidChart.data.labels = labels; tempHumidChart.data.datasets[0].data = tempData; tempHumidChart.data.datasets[1].data = humidData; tempHumidChart.update();
        rainCompareChart.data.labels = labels; rainCompareChart.data.datasets[1].data = rainStatusData; rainCompareChart.update();

    } catch (error) {
        console.error("Error updating charts:", error);
    }
}


// --- INITIALIZATION AND INTERVALS ---

window.onload = () => {
    fetchLocationAndWeather(); 
    fetchLiveData();
    setInterval(fetchLiveData, 5000); 
    updateCharts();
    setInterval(updateCharts, 60000); 
};