#include <LiquidCrystal.h>

#include <RTClib.h>

RTC_DS1307 DS1307_RTC;

// Add these constants at the top with other timing variables
const unsigned long SEND_INTERVAL = 1000;  // Send soil data every 1 second
const unsigned long ESP_TIMEOUT = 3000;    // Wait 3 seconds for ESP response
unsigned long lastSendTime = 0;
bool waitingForESPResponse = false;


// LCD pins: RS, EN, D4, D5, D6, D7
LiquidCrystal lcd(8, 9, 5, 7, 3, 2);

// Soil moisture sensor pins
const int soilSensor1Pin = A1;
const int soilSensor2Pin = A2;
const int soilSensor3Pin = A3;

#define PUMP_PIN 11

// Sensor data variables
int rainAnalog = 0;
int rainDigital = 0;
int rainPercent = 0;
int waterSensor = 0;
float temperature = 0;
float humidity = 0;
float heatIndex = 0;

// Soil moisture variables
int soil1Percent = 0;
int soil2Percent = 0;
int soil3Percent = 0;

const int relayPin = 11;

unsigned long lastReceiveTime = 0;
unsigned long lastSoilReadTime = 0;
unsigned long lastDisplayTime = 0;
unsigned long lastDisplayChangeTime = 0;
bool dataReceived = false;
bool esp32Connected = false;

String serialBuffer = ""; // Buffer for incomplete serial data
bool processingData = false;

// Display state management
enum DisplayState {
  SHOW_IRRIGATION,
  SHOW_SOIL
};
DisplayState currentDisplayState = SHOW_IRRIGATION;

// Connection timeout (5 seconds)
const unsigned long CONNECTION_TIMEOUT = 5000;

void setup() {
  pinMode(PUMP_PIN, OUTPUT);
   if (!DS1307_RTC.begin()) {
    Serial.println("Couldn't find RTC");
    while(1);
  }
   DS1307_RTC.adjust(DateTime(F(__DATE__), F(__TIME__)));
  Serial.begin(9600);
  
  // Initialize LCD
  lcd.begin(16, 2);
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("System Booting...");
  delay(2000);
  
  Serial.println("Smart Vertical Irrigation System Ready");
  Serial.println("Waiting for ESP32 sensor data...");
  
  lastReceiveTime = millis();
  lastSoilReadTime = millis();
  lastDisplayTime = millis();
  lastDisplayChangeTime = millis();

}

void loop() {


  checkSerialData();
  readSoilSensors();
  sendSoilData();  // Add this line
  checkConnectionStatus();
  
  // Update display every 500ms to avoid flickering
  if (millis() - lastDisplayTime >= 500) {
    updateDisplay();
    lastDisplayTime = millis();
  }
  
  // Auto-switch display every 3 seconds if we have ESP data
    if (dataReceived && (millis() - lastDisplayChangeTime == 1000)) {
      switchDisplayState();
      lastDisplayChangeTime = millis();
    }


// Check if we're waiting too long for ESP response
  if (waitingForESPResponse && (millis() - lastSendTime > ESP_TIMEOUT)) {
    waitingForESPResponse = false;
    Serial.println("ESP response timeout");
  }

}

String getTimestamp() {
  DateTime now = DS1307_RTC.now();
  String timestamp = "[";
  timestamp += now.year();
  timestamp += "/";
  if(now.month() < 10) timestamp += "0";
  timestamp += now.month();
  timestamp += "/";
  if(now.day() < 10) timestamp += "0";
  timestamp += now.day();
  timestamp += " ";
  timestamp += (now.hour() < 10 ? "0" : "") + String(now.hour());
  timestamp += ":";
  timestamp += (now.minute() < 10 ? "0" : "") + String(now.minute());
  timestamp += ":";
  timestamp += (now.second() < 10 ? "0" : "") + String(now.second());
  timestamp += "]";
  return timestamp;
}

void checkConnectionStatus() {
  // If we haven't received data for timeout period, mark as disconnected
  if (dataReceived && (millis() - lastReceiveTime > CONNECTION_TIMEOUT)) {
    dataReceived = false;
    esp32Connected = false;
    resetESPValues(); // Clear old ESP data
    Serial.println("ESP32 connection lost!");
  }
}

void resetESPValues() {
  // Reset all ESP32 sensor values to indicate no data
  rainAnalog = 0;
  rainDigital = 0;
  rainPercent = 0;
  waterSensor = 0;
  temperature = 0;
  humidity = 0;
  heatIndex = 0;
}

void switchDisplayState() {
  if (currentDisplayState == SHOW_IRRIGATION) {
    currentDisplayState = SHOW_SOIL;
  } else {
    currentDisplayState = SHOW_IRRIGATION;
  }
}

void sendSoilData() {
  // Only send if we're not waiting for response and have ESP connection
  if (millis() - lastSendTime >= SEND_INTERVAL && !waitingForESPResponse && esp32Connected) {
    String Time = getTimestamp();
    
    String data = "{";
    data += "\"soil1\":" + String(soil1Percent) + ",";
    data += "\"soil2\":" + String(soil2Percent) + ",";
    data += "\"soil3\":" + String(soil3Percent) + ",";
    data += "\"time\":\"" + Time + "\"";
    data += "}";
    
    Serial.println(data);  // Send to ESP32
    
    waitingForESPResponse = true;
    lastSendTime = millis();
    
    // Switch to irrigation display after sending soil data
    currentDisplayState = SHOW_IRRIGATION;
    lastDisplayChangeTime = millis();
  }
}

void readSoilSensors() {
  String Time =getTimestamp();
  // Read soil sensors every 2 seconds
  if (millis() - lastSoilReadTime >= 2000) {
    // Read analog values from soil moisture sensors
    int soil1Value = analogRead(soilSensor1Pin);
    int soil2Value = analogRead(soilSensor2Pin);
    int soil3Value = analogRead(soilSensor3Pin);

    // Convert raw analog values (0-1023) into percentages (0-100)
    // Inverted mapping: higher value = more moisture
    soil1Percent = constrain(map(soil1Value, 1023, 0, 0, 100), 0, 100);
    soil2Percent = constrain(map(soil2Value, 1023, 0, 0, 100), 0, 100);
    soil3Percent = constrain(map(soil3Value, 1023, 0, 0, 100), 0, 100);

    if (soil3Percent < 10) {
    digitalWrite(PUMP_PIN, HIGH);   // turn pump ON
  } else {
    digitalWrite(PUMP_PIN, LOW);    // turn pump OFF
  }
    
    lastSoilReadTime = millis();
  }
}

void checkSerialData() {
  while (Serial.available() > 0 && !processingData) {
    char c = Serial.read();
    
    if (c == '\n') {
      // Complete message received
      processingData = true;
      String rawData = serialBuffer;
      serialBuffer = ""; // Clear buffer
      
      rawData.trim();
      
      if (rawData.length() > 0) {
        processIncomingData(rawData);
      }
      processingData = false;
    } else {
      // Add character to buffer, but limit buffer size
      if (serialBuffer.length() < 200) {
        serialBuffer += c;
      } else {
        // Buffer overflow, reset
        serialBuffer = "";
      }
    }
  }
}

void processIncomingData(String rawData) {
  // Skip soil data (contains only numbers and commas)
  if (isSoilData(rawData)) {
    return; // Ignore soil data echoes
  }

// Reset waiting flag when we receive any valid data from ESP
  if (waitingForESPResponse) {
    waitingForESPResponse = false;
    // Reset display change timer to show irrigation data
    lastDisplayChangeTime = millis();
  }
  
  // // Serial.print(getTimestamp());
  // Serial.print("Received: '");
  // Serial.print(rawData);
  // Serial.println("'");
  
  // Check if it's a connection message
  if (rawData == "ESP32_READY" || rawData.indexOf("All Sensors Initialized") >= 0) {
    Serial.println("ESP32 Sensors Connected!");
    lcd.clear();
    lcd.print("SENSORS CONNECTED");
    esp32Connected = true;
    dataReceived = false; // Reset until we get actual sensor data
    lastReceiveTime = millis();
    return;
  }
  
  // Check if it's sensor data in pipe format
  if (rawData.indexOf("Rain Analog:") >= 0 && rawData.indexOf(" | ") >= 0) {
    // Check if data is complete (contains all expected fields)
    if (isCompleteSensorData(rawData)) {
      // Try to parse the data
      if (parsePipeData(rawData)) {
        dataReceived = true;
        esp32Connected = true;
        lastReceiveTime = millis();

        // Force display to show irrigation data when new data arrives
        currentDisplayState = SHOW_IRRIGATION;
        lastDisplayChangeTime = millis();

      }
    } else {
      Serial.println("Incomplete sensor data received, waiting for complete message");
    }
  }
}

bool isSoilData(String data) {
  // Soil data format: "72,72,72" - only numbers and commas
  for (int i = 0; i < data.length(); i++) {
    char c = data[i];
    if (!isdigit(c) && c != ',' && c != '-') {
      return false;
    }
  }
  return data.indexOf(',') > 0; // Must contain at least one comma
}

bool isCompleteSensorData(String data) {
  // Check if all expected fields are present
  return (data.indexOf("Rain Analog:") >= 0 &&
          data.indexOf("Digital:") >= 0 &&
          data.indexOf("Rain %:") >= 0 &&
          data.indexOf("Water:") >= 0 &&
          data.indexOf("Temp:") >= 0 &&
          data.indexOf("Hum:") >= 0 &&
          data.indexOf("HeatIdx:") >= 0);
}

bool parsePipeData(String data) {
  // Reset values to detect parsing failures
  waterSensor = -1;
  temperature = -999;
  humidity = -999;
  heatIndex = -999;
  
  // Clean the data - remove any incomplete parts
  data = cleanIncompleteData(data);
  
  bool success = true;
  
  // Extract each value with improved error handling
  if (!extractValue(data, "Rain Analog: ", " |", rainAnalog)) success = false;
  if (!extractValue(data, "Digital: ", " |", rainDigital)) success = false;
  if (!extractValue(data, "Rain %: ", " |", rainPercent)) success = false;
  if (!extractValue(data, "Water: ", " |", waterSensor)) success = false;
  if (!extractFloatValue(data, "Temp: ", " |", temperature)) success = false;
  if (!extractFloatValue(data, "Hum: ", " |", humidity)) success = false;
  if (!extractFloatValue(data, "HeatIdx: ", "", heatIndex)) success = false;
  
  // Check if we successfully parsed the critical values
  bool criticalSuccess = (waterSensor != -1 && temperature != -999 && humidity != -999);
  
  if (!criticalSuccess) {
    Serial.println("Failed to parse some critical sensor values");
  }
  
  return criticalSuccess;
}

String cleanIncompleteData(String data) {
  // Remove any incomplete parts that might be concatenated
  int lastComplete = data.lastIndexOf("HeatIdx:");
  if (lastComplete > 0) {
    // Find the end of this complete message
    int end = data.indexOf(" | ", lastComplete);
    if (end == -1) {
      end = data.length();
    } else {
      end += 3; // Include the " | "
    }
    return data.substring(0, end);
  }
  return data;
}

bool extractValue(String data, String startDelimiter, String endDelimiter, int &value) {
  int start = data.indexOf(startDelimiter);
  if (start >= 0) {
    start += startDelimiter.length();
    int end;
    
    if (endDelimiter.length() > 0) {
      end = data.indexOf(endDelimiter, start);
    } else {
      end = data.length();
    }
    
    if (end > start) {
      String valueStr = data.substring(start, end);
      valueStr.trim();
      value = valueStr.toInt();
      return true;
    }
  }
  return false;
}

bool extractFloatValue(String data, String startDelimiter, String endDelimiter, float &value) {
  int start = data.indexOf(startDelimiter);
  if (start >= 0) {
    start += startDelimiter.length();
    int end;
    
    if (endDelimiter.length() > 0) {
      end = data.indexOf(endDelimiter, start);
    } else {
      end = data.length();
    }
    
    if (end > start) {
      String valueStr = data.substring(start, end);
      valueStr.trim();
      
      // Additional validation for float values
      bool validFloat = true;
      int decimalCount = 0;
      for (int i = 0; i < valueStr.length(); i++) {
        char c = valueStr[i];
        if (c == '.') {
          decimalCount++;
          if (decimalCount > 1) validFloat = false;
        } else if (!isdigit(c) && c != '-') {
          validFloat = false;
        }
      }
      
      if (validFloat) {
        value = valueStr.toFloat();
        return true;
      }
    }
  }
  return false;
}

void updateDisplay() {
  static DisplayState lastDisplayState = SHOW_IRRIGATION;
  static bool lastConnectionState = false;
  static int lastSoil1 = -1, lastSoil2 = -1, lastSoil3 = -1;
  static int lastRainPercent = -1, lastWaterSensor = -1;
  static float lastTemperature = -999, lastHumidity = -999;
  
  // Check if we need to update the display
  bool needsUpdate = false;
  
  if (currentDisplayState != lastDisplayState) {
    needsUpdate = true;
    lastDisplayState = currentDisplayState;
  }
  
  if ((dataReceived && esp32Connected) != lastConnectionState) {
    needsUpdate = true;
    lastConnectionState = (dataReceived && esp32Connected);
  }
  
  // Check if sensor values have changed significantly
  if (abs(soil1Percent - lastSoil1) >= 1 || 
      abs(soil2Percent - lastSoil2) >= 1 || 
      abs(soil3Percent - lastSoil3) >= 1) {
    needsUpdate = true;
    lastSoil1 = soil1Percent;
    lastSoil2 = soil2Percent;
    lastSoil3 = soil3Percent;
  }
  
  if (dataReceived && esp32Connected) {
    if (abs(rainPercent - lastRainPercent) >= 1 ||
        abs(waterSensor - lastWaterSensor) >= 5 ||
        abs(temperature - lastTemperature) >= 0.5 ||
        abs(humidity - lastHumidity) >= 1) {
      needsUpdate = true;
      lastRainPercent = rainPercent;
      lastWaterSensor = waterSensor;
      lastTemperature = temperature;
      lastHumidity = humidity;
    }
  }
  
  // Only update display if something changed
  if (!needsUpdate) {
    return;
  }
  
  lcd.clear();
  
  if (dataReceived && esp32Connected) {
    // Show irrigation sensor data
    if (currentDisplayState == SHOW_IRRIGATION) {
      // First line: Rain and Water Level
      lcd.setCursor(0, 0);
      lcd.print("Rain:");
      lcd.print(rainPercent);
      lcd.print("%");
      
      lcd.setCursor(9, 0);
      lcd.print("WL:");
      lcd.print(waterSensor);
      lcd.print("%");
      
      // Second line: Temperature and Humidity
      lcd.setCursor(0, 1);
      lcd.print("T:");
      lcd.print(temperature, 1);
      lcd.print("C");
      
      lcd.setCursor(9, 1);
      lcd.print("H:");
      lcd.print((int)humidity);
      lcd.print("%");
         
    } else {
      // Show soil data
      lcd.setCursor(0, 0);
      lcd.print("S1:");
      lcd.print(soil1Percent);
      lcd.print("% ");
      
      lcd.print(" S2:");
      lcd.print(soil2Percent);
      lcd.print("% ");
      
      lcd.setCursor(0, 1);
      lcd.print(" S3:");
      lcd.print(soil3Percent);
      lcd.print("%");
    }
  } else {
    // Show connection status and soil data only
    displayNoConnection();
  }
}

void displayNoConnection() {
  lcd.clear();
  
  if (millis() - lastReceiveTime < 10000) {
    // Recently had connection
    lcd.setCursor(0, 0);
    lcd.print("SENSORS OFFLINE");
    lcd.setCursor(0, 1);
    lcd.print("Check ESP32");
  } else {
    // Never had connection or long time disconnected
    lcd.setCursor(0, 0);
    lcd.print("NO SENSOR DATA");
    lcd.setCursor(0, 1);
    lcd.print("Check ESP32");
  }
}




void makeIrrigationDecision() {
  Serial.print("Irrigation Status: ");
  
  // Simple irrigation logic based on soil moisture and rain
  int avgSoilMoisture = (soil1Percent + soil2Percent + soil3Percent) / 3;
  
  if (rainPercent > 50) {
    Serial.println("Heavy Rain - No Irrigation");
  } else if (rainPercent > 20) {
    Serial.println("Light Rain - Reduced Irrigation");
  } else if (avgSoilMoisture < 30) {
    Serial.println("Dry Soil - Start Irrigation");
  } else if (avgSoilMoisture < 50) {
    Serial.println("Moderate Soil - Monitor");
  } else {
    Serial.println("Good Moisture - No Irrigation");
  }
}