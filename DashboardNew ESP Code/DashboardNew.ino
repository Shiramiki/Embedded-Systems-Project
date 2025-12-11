// Rain Sensor with ESP32
// Analog pin: D35, Digital pin: D34
#include <DHT.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <ESPmDNS.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <AsyncTCP.h> // Or <ESPmDNS.h> if using mDNS
#include <ESPAsyncWebServer.h>
#include <WebSocketsServer.h> // Or <WebSockets.h>

#include "FS.h"
#include "SD.h"
#include "SPI.h"

String filePath = "/data.csv";

// Soil moisture variables
int soil1Percent = 0;
int soil2Percent = 0;
int soil3Percent = 0;
String receivedTime = "";

// Pin definitions
const int RAIN_SENSOR_ANALOG = 35;  // GPIO35 (ADC1_CH7)
const int RAIN_SENSOR_DIGITAL = 34; // GPIO34 (Input only)

// Water sensor calibration - ADJUST THESE VALUES
const int WATER_EMPTY = 0;    // Value when sensor is completely dry/empty
const int WATER_FULL = 1500;        // Value when sensor is fully submerged




// Rain sensor variables
int analogValue = 0;
int digitalValue = 0;
int rainPercentage = 0;

// Calibration values - adjust these based on your sensor
const int DRY_VALUE = 4095;    // Value when completely dry (no rain)
const int WET_VALUE = 1500;    // Value when completely wet

// Digital threshold - adjust based on testing
const int DIGITAL_THRESHOLD = 2000; // Digital pin triggers below this value

// #define POWER_PIN  17 // ESP32 pin GPIO17 connected to sensor's VCC pin
#define SIGNAL_PIN 33 // ESP32 pin GPIO36 (ADC0) connected to sensor's signal pin

int value = 0; // variable to store the sensor value

// DHT Sensor setup
#define DHT_PIN 5        // GPIO5 (D5)
#define DHT_TYPE DHT11   // DHT11, DHT22, or DHT21

// DHT variables
float temperature = 0;
float humidity = 0;
float heatIndex = 0;

// Initialize DHT sensor
DHT dht(DHT_PIN, DHT_TYPE);

// Timing variables - synchronized with Arduino
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 2000;  // Match Arduino's overall timing
unsigned long lastSoilReceiveTime = 0;
const unsigned long SOIL_TIMEOUT = 1500;   // Wait for soil data

// Communication state
enum CommState {
  WAITING_FOR_SOIL,
  SENDING_SENSOR_DATA,
  IDLE
};
CommState currentState = IDLE;


// Replace with your network credentials
const char* ssid = "I am that I am";
const char* password = "23vmbeiza";


// Create an instance of the server and the WebSocket
AsyncWebServer server(80);
AsyncWebSocket ws("/ws"); // WebSocket endpoint

// Function prototypes
void handleWebSocketEvent(AsyncWebSocket * server, AsyncWebSocketClient * client, AwsEventType type, void * arg, uint8_t *data, size_t len);

void setup() {

  // Initialize Serial for debugging
  Serial.begin(115200);
   // Initialize Serial2 for communication with Arduino
  Serial2.begin(9600, SERIAL_8N1, 16, 17);
  
  Serial2.print("ESP Ready");
  Serial.println("ESP32 Smart Irrigation System");
  delay(1000);
// Try to mount SD card
  if (!SD.begin(21)) {   // Change pin if needed
      Serial.println("❌ SD Card Mount Failed");
      return;
    }

 

  // Check card type
  uint8_t cardType = SD.cardType();
  if (cardType == CARD_NONE) {
    Serial.println("❌ No SD card detected");
    return;
  } else{
    Serial.println("SD Card Detected");
  }

  // Print card type
  Serial.print("✔ SD Card Type: ");
  if (cardType == CARD_MMC)      Serial.println("MMC");
  else if (cardType == CARD_SD)  Serial.println("SDSC");
  else if (cardType == CARD_SDHC)Serial.println("SDHC");
  else                           Serial.println("UNKNOWN");

  // Print size
  uint64_t cardSize = SD.cardSize() / (1024 * 1024);
  Serial.printf("✔ SD Card Size: %llu MB\n", cardSize);
  // ----- CREATE + WRITE FILE -----
  File file = SD.open("/test.txt", FILE_WRITE);
  if (!file) {
    Serial.println("❌ Failed to create file");
    return;
  }

  if (file.println("Hello, this is a test file!")) {
    Serial.println("✔ File written successfully");
  } else {
    Serial.println("❌ Failed to write to file");
  }
  file.close();


  // ----- READ FILE -----
  file = SD.open("/test.txt");
  if (!file) {
    Serial.println("❌ Failed to open file for reading");
    return;
  }

  Serial.println("📄 File Contents:");
  while (file.available()) {
    Serial.write(file.read());
  }
  file.close();


  // ----- DELETE FILE -----
  if (SD.remove("/test.txt")) {
    Serial.println("\n✔ File deleted successfully");
  } else {
    Serial.println("\n❌ Failed to delete file");
  }
  // ----- CREATE FILE WITH HEADER IF NOT EXISTS -----
  if (!SD.exists(filePath)) {
    File file = SD.open(filePath, FILE_WRITE);
    if (!file) {
      Serial.println("❌ Failed to create data.csv");
      return;
    }

    file.println("Timestamp,Temperature(C),HeatIndex,Humidity(%),Rain,WaterLevel,Soil1(%),Soil2(%),Soil3(%)");
    file.close();
    Serial.println("✔ Created data.csv with headers");
  } else {
    Serial.println("✔ data.csv already exists");
  }
SD.remove("/data.csv)) 
  //  // ----- READ data.csv FILE -----
  // File file2 = SD.open(filePath);
  // if (!file2) {
  //   Serial.println("❌ Failed to open data.csv for reading");
  // } else {
  //   Serial.println("📄 data.csv Contents:");
  //   while (file2.available()) {
  //     Serial.write(file2.read());
  //   }
  //   file2.close();
  
  // }
  
  // Configure pins
  pinMode(RAIN_SENSOR_ANALOG, INPUT);
  pinMode(RAIN_SENSOR_DIGITAL, INPUT);
  
  // set the ADC attenuation to 11 dB (up to ~3.3V input)
  // analogSetAttenuation(ADC_11db);
  // pinMode(POWER_PIN, OUTPUT);   // configure pin as an OUTPUT
  // // digitalWrite(POWER_PIN, LOW); // turn the sensor OFF

  // ... inside setup()
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED) {
      delay(500);
      Serial.print(".");
      // If it takes longer than 30 seconds, something is seriously wrong
      if (millis() - startAttempt > 30000) {
          Serial.println("\n❌ FAILED TO CONNECT AFTER 30 SECONDS.");
          return; // Exit setup or restart
      }
  }
Serial.println("\nConnected, IP: " + WiFi.localIP().toString());
// ... rest of setup()

    // Attach the WebSocket event handler
    ws.onEvent(handleWebSocketEvent);
    server.addHandler(&ws);

  // ... inside setup() function ...

// --- WiFi Connection Logic ---
// ... (Your WiFi.begin and while loop code here) ...

// --- ASYNC SERVER HANDLERS ---
ws.onEvent(handleWebSocketEvent);
server.addHandler(&ws);

// Handler for index.html
server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SD, "/index.html", "text/html"); 
});

// Handler for script.js
server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SD, "/script.js", "application/javascript");
});

// Handler for style.css
server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(SD, "/style.css", "text/css");
});

// 💥 CORRECTED FIX: SD Card Download Handler (PUT IT HERE)
server.on("/download-sd-csv", HTTP_GET, [](AsyncWebServerRequest *request){
    const char* filename = "/data.csv";
    
    // Check if the data.csv file exists
    if (SD.exists(filename)) {
        
        // 1. Create the response object using beginResponse:
        AsyncWebServerResponse *response = request->beginResponse(SD, filename, "text/csv", true);

        // 2. Add the custom header to explicitly set the filename.
        response->addHeader("Content-Disposition", "attachment; filename=svris_sd_data_export.csv");
        
        // 3. Send the constructed response object
        request->send(response);
        
    } else {
        request->send(404, "text/plain", "Error: data.csv not found on SD card.");
    }
});
// -----------------------------------------------------------

server.begin(); // <-- Ensure this is called AFTER all handlers are defined.

// ... (Start DHT sensor, Serial print messages, and delay(2000) below) ...

    // Start server
    server.begin();

  // Start DHT sensor
  dht.begin();
  
  // Send ready signal
  // Serial2.println("ESP32_READY");
  Serial.println("All Sensors Initialized - Waiting for Arduino...");
  Serial.println("================================================");
  
  delay(2000); // Give sensors time to initialize
}

void handleWebSocketEvent(AsyncWebSocket * server, AsyncWebSocketClient * client, AwsEventType type, void * arg, uint8_t *data, size_t len) {
    switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("Client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
            break;
        case WS_EVT_DISCONNECT:
            Serial.printf("Client #%u disconnected\n", client->id());
            break;
        case WS_EVT_DATA:
            // Handle incoming messages from the dashboard if necessary (e.g., control commands)
            // For now, we only care about sending data *to* the dashboard.
            break;
        default:
            break;
    }
}

void loop() {
  // Always check for incoming soil data first
  checkForSoilData();
  
  // Simple timing-based approach - send every 2 seconds
  if (millis() - lastSendTime >= SEND_INTERVAL) {
    sendSensorData();
    
  }
  ws.cleanupClients();
  String sensorData = "";
    
    sensorData += receivedTime;    
    sensorData += ",";
    sensorData += String(temperature, 1); // Use 1 decimal place for precision
    sensorData += ",";
    sensorData += String(heatIndex, 1);
    sensorData += ",";
    sensorData += String(humidity, 1);
    sensorData += ",";
    sensorData += rainPercentage;
    sensorData += ",";
    sensorData += String(getWaterLevel() );           // Integer/Raw value
    sensorData += ",";
    sensorData += soil1Percent;
    sensorData += ",";
    sensorData += soil2Percent;
    sensorData += ",";
    sensorData += soil3Percent; // This is the last item, no trailing comma needed

    // 3. Broadcast the data to all connected clients
    if (ws.count() > 0) {
        Serial.print("Sending: ");
        Serial.println(sensorData);
        ws.textAll(sensorData);
    }
 
  
  // Small delay to prevent overwhelming the system
  delay(50);
}

String getWaterLevel() {
    int halfLevel = WATER_FULL / 2;
    if (value >= WATER_FULL) return "H";
    else if (value <= WATER_EMPTY) return "H";
    else if (value <= halfLevel) return "H";
    return "M"; // Medium
}

void checkForSoilData() {
  if (Serial2.available()) {
    String receivedData = Serial2.readStringUntil('\n');
    receivedData.trim();
    
    if (receivedData.length() > 0) {
      processIncomingData(receivedData);
    }
  }
}

void processIncomingData(String data) {
  // Check if it's soil data (JSON format)
  if (data.startsWith("{")) {
    if (parseSoilData(data)) {
      lastSoilReceiveTime = millis();
      printReceivedData();
    }
  }
  // Check for request data message
  else if (data == "REQUEST_DATA") {
    // Send data immediately when requested
    sendSensorData();
  }
}

bool parseSoilData(String jsonData) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, jsonData);
  
  if (!error) {
    soil1Percent = doc["soil1"];
    soil2Percent = doc["soil2"]; 
    soil3Percent = doc["soil3"];
    receivedTime = doc["time"].as<String>();
    
    Serial.println("✓ Soil data parsed successfully");
    return true;
  } else {
    Serial.print("✗ JSON parsing failed: ");
    Serial.println(error.c_str());
    return false;
  }
}


void readSensors() {
  // Read rain sensor values
  analogValue = analogRead(RAIN_SENSOR_ANALOG);
  digitalValue = digitalRead(RAIN_SENSOR_DIGITAL);
  
  // Calculate rain percentage (inverted: lower value = more rain)
  rainPercentage = map(analogValue, WET_VALUE, DRY_VALUE, 100, 0);
  rainPercentage = constrain(rainPercentage, 0, 100);
  
  // Read water sensor
  // digitalWrite(POWER_PIN, HIGH);  // turn the sensor ON
  delay(10);                      // wait 10 milliseconds
  value = analogRead(SIGNAL_PIN); // read the analog value from sensor
  Serial.println(value);
  // digitalWrite(POWER_PIN, LOW);   // turn the sensor OFF
   // Calculate water percentage
  
  // Read DHT sensor
  readDHT();
}

void sendSensorData() {
  // Ensure we have the latest sensor readings
  readSensors();

  String waterLevel = getWaterLevel();
  
  // Send sensor data in the format Arduino expects
  String data = "Rain Analog: ";
  data += String(analogValue);
  data += " | Digital: ";
  data += String(digitalValue);
  data += " | Rain %: ";
  data += String(rainPercentage);
  data += " | Water: ";
  data += String(waterLevel);
  data += " | Temp: ";
  data += String(temperature, 1);
  data += " | Hum: ";
  data += String(humidity, 1);
  data += " | HeatIdx: ";
  data += String(heatIndex, 1);
  
  Serial2.println(data);
  
  // Print to serial for debugging
  Serial.print("📤 Sent: ");
  Serial.println(data);
  
  lastSendTime = millis();
   logSensorData();
}

void readDHT() {
  // Read temperature as Celsius
  temperature = dht.readTemperature();
  // Read humidity
  humidity = dht.readHumidity();
  
  // Check if any reads failed
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("⚠ Failed to read from DHT sensor!");
    // Don't return, use previous values
    return;
  }
  
  // Compute heat index (feels like temperature)
  heatIndex = dht.computeHeatIndex(temperature, humidity, false);
}

void printReceivedData() {
  Serial.println("=== Received Soil Data ===");
  Serial.println("Soil 1: " + String(soil1Percent) + "%");
  Serial.println("Soil 2: " + String(soil2Percent) + "%"); 
  Serial.println("Soil 3: " + String(soil3Percent) + "%");
  Serial.println("Time: " + receivedTime);
  Serial.println("===========================");
}

// Optional: Add this function to display all current readings
void displayAllReadings() {
  Serial.println("\n====== ALL SENSOR READINGS ======");
  Serial.println("Rain Sensor:");
  Serial.println("  Analog: " + String(analogValue));
  Serial.println("  Digital: " + String(digitalValue));
  Serial.println("  Percentage: " + String(rainPercentage) + "%");
  Serial.println("Water Level: " + String(value));
  Serial.println("DHT Sensor:");
  Serial.println("  Temperature: " + String(temperature, 1) + "°C");
  Serial.println("  Humidity: " + String(humidity, 1) + "%");
  Serial.println("  Heat Index: " + String(heatIndex, 1) + "°C");
  Serial.println("Soil Moisture:");
  Serial.println("  Soil 1: " + String(soil1Percent) + "%");
  Serial.println("  Soil 2: " + String(soil2Percent) + "%");
  Serial.println("  Soil 3: " + String(soil3Percent) + "%");
  Serial.println("=================================\n");
}

// Keep existing utility functions
void interpretReadings(int analogVal, int digitalVal, int rainPercent) {
  Serial.print("Status: ");
  
  if (digitalVal == LOW) {
    Serial.println("RAIN DETECTED! (Digital trigger)");
  } else {
    Serial.println("No rain (Digital)");
  }
  
  Serial.print("Condition: ");
  if (rainPercent < 20) {
    Serial.println("Dry");
  } else if (rainPercent < 40) {
    Serial.println("Light Moisture");
  } else if (rainPercent < 60) {
    Serial.println("Moderate Rain");
  } else if (rainPercent < 80) {
    Serial.println("Heavy Rain");
  } else {
    Serial.println("Very Heavy Rain");
  }
}

void interpretComfortLevels() {
  Serial.print("Comfort: ");
  
  if (humidity < 30) {
    Serial.print("Too dry");
  } else if (humidity < 40) {
    Serial.print("Dry");
  } else if (humidity < 60) {
    Serial.print("Comfortable");
  } else if (humidity < 70) {
    Serial.print("Moderately humid");
  } else {
    Serial.print("Very humid");
  }
  
  Serial.print(" | ");
  
  if (temperature < 10) {
    Serial.println("Cold");
  } else if (temperature < 20) {
    Serial.println("Cool");
  } else if (temperature < 27) {
    Serial.println("Comfortable");
  } else if (temperature < 35) {
    Serial.println("Warm");
  } else {
    Serial.println("Hot");
  }
}

void logSensorData() {  

  // Don’t save until timestamp is received from Arduino
  if (receivedTime == "" || receivedTime == "null") {
    Serial.println("⏳ Waiting for Arduino timestamp...");
    return;
  }

  File myFile = SD.open("/data.csv", FILE_APPEND);
  if (!myFile) {
    Serial.println("❌ Error opening data.csv");
    return;
  }

  // Write row
  myFile.print(receivedTime);        myFile.print(",");
  myFile.print(temperature);         myFile.print(",");
  myFile.print(heatIndex);           myFile.print(",");
  myFile.print(humidity);            myFile.print(",");
  myFile.print(rainPercentage);      myFile.print(",");
  myFile.print(getWaterLevel());               myFile.print(",");
  myFile.print(soil1Percent);        myFile.print(",");
  myFile.print(soil2Percent);        myFile.print(",");
  myFile.println(soil3Percent);

  myFile.close();

  Serial.println("✔ Logged to SD with timestamp: " + receivedTime);
}
