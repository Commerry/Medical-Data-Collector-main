# ESP32 Integration Guide - Medical Data Collector

## 📋 Overview

เอกสารนี้อธิบายวิธีการเชื่อมต่อ ESP32 กับระบบ Medical Data Collector ผ่าน MQTT Protocol

---

## � Quick Start - Unified Vitals Topic (Recommended)

**สำหรับผู้พัฒนาใหม่ - ใช้วิธีนี้**

แทนที่จะส่ง vital signs แยกกันหลายครั้ง สามารถส่งสิ่งวัดทั้งหมดในหนึ่ง message ไปยังหนึ่ง topic เดียว

### Topic
```
clinic/vitals/data
```

### Message Format

```json
{
  "idcard": "7012345678901",
  "weight": 65.5,
  "height": 170.0,
  "bp": "120/80",
  "temp": 36.5,
  "pulse": 78,
  "timestamp": "2024-02-02T10:30:00.000Z"
}
```

**หมายเหตุ:**
- `idcard` - รหัสประชาชน (จากเครื่องสแกนบัตร)
- `weight` - น้ำหนัก (กิโลกรัม) - ไม่บังคับ
- `height` - ส่วนสูง (เซนติเมตร) - ไม่บังคับ
- `bp` - ความดันโลหิต รูป "systolic/diastolic" เช่น "120/80" - ไม่บังคับ
- `temp` - อุณหภูมิ (องศาเซลเซียส) - ไม่บังคับ
- `pulse` - อัตราการเต้นของหัวใจ (BPM) - ไม่บังคับ
- `timestamp` - เวลา ISO format (ที่เพิ่มเติม)

### Arduino Code Example

```cpp
void sendCombinedVitals(
  String idcard,
  float weight = -1,
  float height = -1,
  String bp = "",
  float temp = -1,
  int pulse = -1
) {
  StaticJsonDocument<300> doc;
  doc["idcard"] = idcard;
  
  // Add only measurements that are valid (not -1 or empty)
  if (weight > 0) doc["weight"] = weight;
  if (height > 0) doc["height"] = height;
  if (bp != "") doc["bp"] = bp;
  if (temp > 0) doc["temp"] = temp;
  if (pulse > 0) doc["pulse"] = pulse;
  
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  const char* topic = "clinic/vitals/data";
  
  if (client.publish(topic, payload.c_str())) {
    Serial.println("✓ Combined vitals sent successfully");
    Serial.println("Payload: " + payload);
  } else {
    Serial.println("✗ Failed to send combined vitals");
  }
}

// Usage Examples:

// ตัวอย่าง 1: ส่งเฉพาะน้ำหนัก
sendCombinedVitals("7012345678901", 65.5);

// ตัวอย่าง 2: ส่งน้ำหนัก ส่วนสูง และความดันโลหิต
sendCombinedVitals("7012345678901", 65.5, 170.0, "120/80");

// ตัวอย่าง 3: ส่งทั้งหมด
sendCombinedVitals(
  "7012345678901",
  65.5,      // weight
  170.0,     // height
  "120/80",  // bp
  36.5,      // temp
  78         // pulse
);

// ตัวอย่าง 4: ส่งเฉพาะอุณหภูมิและชีพจร
sendCombinedVitals("7012345678901", -1, -1, "", 36.5, 78);
```

### Flow Diagram

```
┌─────────────────────────────────────┐
│  Card Reader Scans Patient Card     │
│  Send: {idcard: "XXXXXXXXXXXX"}     │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  Collect All Vital Measurements     │
│  - Weight scale                     │
│  - Height meter                     │
│  - BP monitor                       │
│  - Thermometer                      │
│  - Pulse sensor                     │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  MQTT Publish clinic/vitals/data    │
│  with all measurements in one JSON  │
└──────────────┬──────────────────────┘
               │
               ↓
┌─────────────────────────────────────┐
│  Server receives ONE message        │
│  Updates ALL fields in visit record │
│  Efficient & Reliable               │
└─────────────────────────────────────┘
```

### Advantages

✅ **Efficient** - ส่ง 1 message แทน 5 messages
✅ **Atomic** - ข้อมูลทั้งหมด update พร้อมกัน
✅ **Flexible** - ส่งได้บาง measurement ที่มีเท่านั้น
✅ **Simple** - Code ง่ายขึ้น
✅ **Reliable** - ลดโอกาส packet loss

---

## 🔌 Connection Requirements

### WiFi Configuration
```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
```

### MQTT Broker Configuration
```cpp
const char* mqtt_server = "192.168.1.XXX";  // IP ของเครื่องที่รัน Medical Data Collector
const int mqtt_port = 1883;
const char* mqtt_user = "clinic_device";    // ดูจากหน้า Settings
const char* mqtt_pass = "XXXXX";            // ดูจากหน้า Settings
const char* pcucode = "09584";              // รหัสสถานบริการ
```

---

## 📡 MQTT Topics - Legacy Format

### Topic Format
```
clinic/{pcucode}/device/{device_type}/data
```

### Device Types

| Device | device_type | Topic Example |
|--------|------------|---------------|
| Card Reader | `cardreader` | `clinic/09584/device/cardreader/data` |
| Weight Scale | `weight` | `clinic/09584/device/weight/data` |
| Height Meter | `height` | `clinic/09584/device/height/data` |
| BP Monitor | `bp` | `clinic/09584/device/bp/data` |
| Thermometer | `temp` | `clinic/09584/device/temp/data` |
| Pulse Oximeter / Heart Rate | `pulse` | `clinic/09584/device/pulse/data` |

---

## 📤 Message Formats

### 1. Card Reader (เริ่มต้น Session)

**ต้องส่งก่อนอุปกรณ์อื่นทั้งหมด**

```json
{
  "device_type": "cardreader",
  "idcard": "7012345678901",
  "timestamp": "2024-02-02T10:30:00.000Z"
}
```

**Reset Session (idcard ว่าง):**
```json
{
  "device_type": "cardreader",
  "timestamp": "2024-02-02T10:30:00.000Z"
}
```

**Arduino Code:**
```cpp
void sendCardData(String idcard) {
  StaticJsonDocument<200> doc;
  doc["device_type"] = "cardreader";
  doc["idcard"] = idcard;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/cardreader/data";
  client.publish(topic.c_str(), payload.c_str());
}
```

---

### 2. Weight Scale

```json
{
  "device_type": "weight",
  "weight": 65.5,
  "timestamp": "2024-02-02T10:30:15.000Z"
}
```

**Arduino Code:**
```cpp
void sendWeightData(float weight) {
  StaticJsonDocument<200> doc;
  doc["device_type"] = "weight";
  doc["weight"] = weight;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/weight/data";
  client.publish(topic.c_str(), payload.c_str());
}
```

---

### 3. Height Meter

```json
{
  "device_type": "height",
  "height": 170.0,
  "timestamp": "2024-02-02T10:30:20.000Z"
}
```

**Arduino Code:**
```cpp
void sendHeightData(float height) {
  StaticJsonDocument<200> doc;
  doc["device_type"] = "height";
  doc["height"] = height;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/height/data";
  client.publish(topic.c_str(), payload.c_str());
}
```

---

### 4. Blood Pressure Monitor

```json
{
  "device_type": "bp",
  "pressure": "120/80",
  "timestamp": "2024-02-02T10:30:25.000Z"
}
```

**Arduino Code:**
```cpp
void sendBPData(String pressure) {
  StaticJsonDocument<200> doc;
  doc["device_type"] = "bp";
  doc["pressure"] = pressure;  // Format: "systolic/diastolic" เช่น "120/80"
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/bp/data";
  client.publish(topic.c_str(), payload.c_str());
}
```

---

### 5. Thermometer

```json
{
  "device_type": "temp",
  "temperature": 36.5,
  "timestamp": "2024-02-02T10:30:30.000Z"
}
```

**Arduino Code:**
```cpp
void sendTempData(float temperature) {
  StaticJsonDocument<200> doc;
  doc["device_type"] = "temp";
  doc["temperature"] = temperature;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/temp/data";
  client.publish(topic.c_str(), payload.c_str());
}
```

---

### 6. Pulse (Heart Rate)

```json
{
  "device_type": "pulse",
  "pulse": 78,
  "timestamp": "2024-02-02T10:30:35.000Z"
}
```

**Arduino Code:**
```cpp
void sendPulseData(int pulse) {
  StaticJsonDocument<200> doc;
  doc["device_type"] = "pulse";
  doc["pulse"] = pulse;  // bpm
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/pulse/data";
  client.publish(topic.c_str(), payload.c_str());
}
```

---

## 🔧 Complete Arduino Example

### Required Libraries
```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
```

### Install Libraries
```bash
# Arduino IDE > Library Manager
- WiFi (built-in)
- PubSubClient by Nick O'Leary
- ArduinoJson by Benoit Blanchon
```

### Full Code Example

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration
const char* mqtt_server = "192.168.1.100";  // เปลี่ยนเป็น IP จริง
const int mqtt_port = 1883;
const char* mqtt_user = "clinic_device";
const char* mqtt_pass = "your_mqtt_password";  // จากหน้า Settings
const char* pcucode = "09584";

// NTP Configuration (สำหรับ timestamp)
const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 25200;  // GMT+7 (Thailand)
const int daylightOffset_sec = 0;

WiFiClient espClient;
PubSubClient client(espClient);

// Current session ID card
String currentIDCard = "";

void setup() {
  Serial.begin(115200);
  
  // Connect to WiFi
  setupWiFi();
  
  // Setup NTP
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  // Setup MQTT
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
  
  // Your device logic here
  // Example: Check if card is inserted, read sensors, etc.
}

void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    
    // Create a random client ID
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);
    
    // Attempt to connect
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  // Handle incoming messages if needed
  Serial.print("Message arrived [");
  Serial.print(topic);
  Serial.print("] ");
  for (int i = 0; i < length; i++) {
    Serial.print((char)payload[i]);
  }
  Serial.println();
}

String getISOTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("Failed to obtain time");
    return "2024-01-01T00:00:00.000Z";
  }
  
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S.000Z", &timeinfo);
  return String(buffer);
}

// ============================================
// Device Functions
// ============================================

void sendCardData(String idcard) {
  StaticJsonDocument<200> doc;
  doc["device_type"] = "cardreader";
  doc["idcard"] = idcard;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/cardreader/data";
  
  if (client.publish(topic.c_str(), payload.c_str())) {
    Serial.println("Card data sent successfully");
    currentIDCard = idcard;  // Store for later use
  } else {
    Serial.println("Failed to send card data");
  }
}

void sendWeightData(float weight) {
  if (currentIDCard == "") {
    Serial.println("ERROR: No active session (scan card first)");
    return;
  }
  
  StaticJsonDocument<200> doc;
  doc["device_type"] = "weight";
  doc["weight"] = weight;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/weight/data";
  
  if (client.publish(topic.c_str(), payload.c_str())) {
    Serial.println("Weight data sent successfully");
  } else {
    Serial.println("Failed to send weight data");
  }
}

void sendHeightData(float height) {
  if (currentIDCard == "") {
    Serial.println("ERROR: No active session (scan card first)");
    return;
  }
  
  StaticJsonDocument<200> doc;
  doc["device_type"] = "height";
  doc["height"] = height;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/height/data";
  
  if (client.publish(topic.c_str(), payload.c_str())) {
    Serial.println("Height data sent successfully");
  } else {
    Serial.println("Failed to send height data");
  }
}

void sendBPData(String pressure) {
  if (currentIDCard == "") {
    Serial.println("ERROR: No active session (scan card first)");
    return;
  }
  
  StaticJsonDocument<200> doc;
  doc["device_type"] = "bp";
  doc["pressure"] = pressure;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/bp/data";
  
  if (client.publish(topic.c_str(), payload.c_str())) {
    Serial.println("BP data sent successfully");
  } else {
    Serial.println("Failed to send BP data");
  }
}

void sendTempData(float temperature) {
  if (currentIDCard == "") {
    Serial.println("ERROR: No active session (scan card first)");
    return;
  }
  
  StaticJsonDocument<200> doc;
  doc["device_type"] = "temp";
  doc["temperature"] = temperature;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/temp/data";
  
  if (client.publish(topic.c_str(), payload.c_str())) {
    Serial.println("Temperature data sent successfully");
  } else {
    Serial.println("Failed to send temperature data");
  }
}

void sendPulseData(int pulse) {
  if (currentIDCard == "") {
    Serial.println("ERROR: No active session (scan card first)");
    return;
  }
  
  StaticJsonDocument<200> doc;
  doc["device_type"] = "pulse";
  doc["pulse"] = pulse;
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  String topic = "clinic/" + String(pcucode) + "/device/pulse/data";
  
  if (client.publish(topic.c_str(), payload.c_str())) {
    Serial.println("Pulse data sent successfully");
  } else {
    Serial.println("Failed to send pulse data");
  }
}

void clearSession() {
  currentIDCard = "";
  Serial.println("Session cleared");
}

// ============================================
// Example Usage in loop()
// ============================================

/*
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
  
  // Example: Card reader detected
  if (cardReaderHasCard()) {
    String idcard = readIDCard();
    sendCardData(idcard);
    delay(1000);
  }
  
  // Example: Weight scale has reading
  if (weightScaleReady()) {
    float weight = readWeight();
    sendWeightData(weight);
    delay(1000);
  }
  
  // Example: Height meter has reading
  if (heightMeterReady()) {
    float height = readHeight();
    sendHeightData(height);
    delay(1000);
  }
  
  // Example: BP monitor has reading
  if (bpMonitorReady()) {
    String bp = readBP();  // Returns "120/80"
    sendBPData(bp);
    delay(1000);
  }
  
  // Example: Thermometer has reading
  if (thermometerReady()) {
    float temp = readTemperature();
    sendTempData(temp);
    delay(1000);
  }

  // Example: Pulse sensor has reading
  if (pulseSensorReady()) {
    int pulse = readPulseBpm();
    sendPulseData(pulse);
    delay(1000);
  }
  
  // Optional: Clear session after card removed
  if (cardRemoved()) {
    clearSession();
  }
  
  delay(100);
}
*/
```

---

## 🎯 Complete Example - Unified Vitals Approach (Recommended)

**เรียบง่าย ประสิทธิภาพสูง และทำงานได้มั่นคง**

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ========== CONFIGURATION ==========
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "192.168.1.100";
const int mqtt_port = 1883;
const char* mqtt_user = "clinic_device";
const char* mqtt_pass = "your_password";

const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 25200;  // GMT+7
const int daylightOffset_sec = 0;

WiFiClient espClient;
PubSubClient client(espClient);
String currentIDCard = "";

struct VitalsData {
  float weight = -1;
  float height = -1;
  String bp = "";
  float temp = -1;
  int pulse = -1;
};
VitalsData latestVitals;

void setupWiFi() {
  delay(10);
  Serial.print("Connecting to: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("✓ WiFi connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  }
}

void reconnect() {
  if (client.connected()) return;
  
  Serial.print("Connecting to MQTT...");
  String clientId = "ESP32-" + String(random(0xffff), HEX);
  
  if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
    Serial.println(" ✓ Connected!");
  } else {
    Serial.print(" ✗ Failed (rc=");
    Serial.print(client.state());
    Serial.println(") retrying...");
    delay(5000);
  }
}

String getISOTimestamp() {
  time_t now = time(nullptr);
  struct tm* timeinfo = localtime(&now);
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S.000Z", timeinfo);
  return String(buffer);
}

void onCardScanned(String idcard) {
  currentIDCard = idcard;
  latestVitals = VitalsData();
  Serial.print("✓ Card: ");
  Serial.println(idcard);
}

void onWeightMeasured(float weight) {
  latestVitals.weight = weight;
  Serial.print("Weight: ");
  Serial.print(weight);
  Serial.println(" kg");
}

void onHeightMeasured(float height) {
  latestVitals.height = height;
  Serial.print("Height: ");
  Serial.print(height);
  Serial.println(" cm");
}

void onBPMeasured(String bp) {
  latestVitals.bp = bp;
  Serial.print("BP: ");
  Serial.println(bp);
}

void onTemperatureMeasured(float temp) {
  latestVitals.temp = temp;
  Serial.print("Temp: ");
  Serial.print(temp);
  Serial.println(" °C");
}

void onPulseMeasured(int pulse) {
  latestVitals.pulse = pulse;
  Serial.print("Pulse: ");
  Serial.print(pulse);
  Serial.println(" bpm");
}

bool isAnyVitalAvailable() {
  return latestVitals.weight > 0 || latestVitals.height > 0 ||
         latestVitals.bp != "" || latestVitals.temp > 0 || latestVitals.pulse > 0;
}

void sendCombinedVitals() {
  if (currentIDCard == "") {
    Serial.println("✗ No session - scan card first");
    return;
  }
  
  if (!isAnyVitalAvailable()) {
    Serial.println("✗ No measurements");
    return;
  }
  
  StaticJsonDocument<300> doc;
  doc["idcard"] = currentIDCard;
  
  if (latestVitals.weight > 0) doc["weight"] = latestVitals.weight;
  if (latestVitals.height > 0) doc["height"] = latestVitals.height;
  if (latestVitals.bp != "") doc["bp"] = latestVitals.bp;
  if (latestVitals.temp > 0) doc["temp"] = latestVitals.temp;
  if (latestVitals.pulse > 0) doc["pulse"] = latestVitals.pulse;
  
  doc["timestamp"] = getISOTimestamp();
  
  String payload;
  serializeJson(doc, payload);
  
  if (client.publish("clinic/vitals/data", payload.c_str())) {
    Serial.print("✓ Published: ");
    Serial.println(payload);
    latestVitals = VitalsData();
  } else {
    Serial.println("✗ Publish failed");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Medical Data Collector - ESP32 ===");
  setupWiFi();
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();
  
  // Process serial input for testing
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    
    if (input.startsWith("CARD:")) {
      onCardScanned(input.substring(5));
    } else if (input.startsWith("WEIGHT:")) {
      onWeightMeasured(input.substring(7).toFloat());
    } else if (input.startsWith("HEIGHT:")) {
      onHeightMeasured(input.substring(7).toFloat());
    } else if (input.startsWith("BP:")) {
      onBPMeasured(input.substring(3));
    } else if (input.startsWith("TEMP:")) {
      onTemperatureMeasured(input.substring(5).toFloat());
    } else if (input.startsWith("PULSE:")) {
      onPulseMeasured(input.substring(6).toInt());
    } else if (input == "SEND") {
      sendCombinedVitals();
    }
  }
  
  delay(100);
}
```

### Testing Commands
```
CARD:7012345678901    // Scan ID card
WEIGHT:65.5           // Record weight
HEIGHT:170.0          // Record height
BP:120/80             // Record blood pressure
TEMP:36.5             // Record temperature
PULSE:78              // Record pulse
SEND                  // Send all measurements
```

---

## 🔍 Testing & Debugging

### Serial Monitor Output (Expected)
```
Connecting to WiFi_Name.......
WiFi connected
IP address: 192.168.1.150
Attempting MQTT connection...connected
Card data sent successfully
Weight data sent successfully
Height data sent successfully
BP data sent successfully
Temperature data sent successfully
Pulse data sent successfully
```

### Using MQTT Explorer (Desktop Tool)
1. Download: http://mqtt-explorer.com/
2. Connect to broker:
   - Host: [Computer IP]
   - Port: 1883
   - Username: clinic_device
   - Password: [from Settings]
3. Subscribe to: `clinic/#`
4. You should see all messages from ESP32

### Common Issues

#### ❌ WiFi Connection Failed
```cpp
// Check:
- SSID and password correct
- WiFi router is on
- ESP32 is in range
- Serial output shows actual error
```

#### ❌ MQTT Connection Failed
```cpp
// Return codes:
// -4 : MQTT_CONNECTION_TIMEOUT
// -3 : MQTT_CONNECTION_LOST
// -2 : MQTT_CONNECT_FAILED
// -1 : MQTT_DISCONNECTED
//  0 : MQTT_CONNECTED
//  1 : MQTT_CONNECT_BAD_PROTOCOL
//  2 : MQTT_CONNECT_BAD_CLIENT_ID
//  3 : MQTT_CONNECT_UNAVAILABLE
//  4 : MQTT_CONNECT_BAD_CREDENTIALS
//  5 : MQTT_CONNECT_UNAUTHORIZED

// Most common: Check username/password
```

#### ❌ Messages Not Appearing in Dashboard
```cpp
// Check:
1. MQTT connection successful
2. Topic format is correct
3. JSON format is valid
4. Computer app is running
5. Check logs folder on computer
```

---

## 📊 Data Flow Sequence

```
Step 1: Card Reader
┌─────────────┐
│   ESP32     │
│ Card Reader │
└──────┬──────┘
       │ Read ID Card
       │ "7012345678901"
       ▼
Publish: clinic/09584/device/cardreader/data
{
  "device_type": "cardreader",
  "idcard": "7012345678901",
  "timestamp": "2024-02-02T10:30:00Z"
}
       │
       ▼
┌──────────────┐
│ Desktop App  │
│ Creates      │
│ Session      │
└──────────────┘

Step 2-6: Other Devices (can be in any order)
┌─────────────┐
│   ESP32     │
│ Weight      │
│ Height      │
│ BP Monitor  │
│ Thermometer │
│ Pulse        │
└──────┬──────┘
       │ Send readings
       │ (all with same idcard)
       ▼
Desktop App → Update MySQL
       ▼
Dashboard shows real-time data
```

---

## ⚠️ Important Rules

### 1. Card Reader (Optional)
- ไม่จำเป็นต้องส่ง cardreader ก่อนอุปกรณ์อื่น
- ถ้ามีการส่ง cardreader ระบบจะบันทึก `idcard` เป็นข้อมูลอ้างอิงของ session ล่าสุด
- หากส่ง cardreader ที่ `idcard` ว่าง ระบบจะล้าง Active Session และรอข้อมูลใหม่

**อัปเดต:**
- อุปกรณ์อื่น (weight/height/bp/temp/pulse) **ไม่ต้องส่ง** `idcard`
- สามารถส่งข้อมูลได้แม้ยังไม่มี cardreader

### 2. ID Card Format
- ต้องเป็นตัวเลข 13 หลัก
- ไม่มี dash หรือ space
- ตัวอย่างถูก: `"7012345678901"`
- ตัวอย่างผิด: `"701-234-5678-901"` ❌

### 3. Blood Pressure Format
- ต้องเป็น string format `"systolic/diastolic"`
- ตัวอย่างถูก: `"120/80"`
- ตัวอย่างผิด: `120/80` (ไม่มี quotes) ❌

### 4. Pulse Value
- ชีพจร (pulse): จำนวนเต็ม bpm
- ตัวอย่างถูก: `78`

### 5. Decimal Values
- น้ำหนัก (weight): รับได้ทศนิยม 1 ตำแหน่ง
- ส่วนสูง (height): รับได้ทศนิยม 1 ตำแหน่ง
- อุณหภูมิ (temperature): รับได้ทศนิยม 1 ตำแหน่ง

### 6. Timestamp
- ใช้ ISO 8601 format
- ใช้ NTP server เพื่อความแม่นยำ
- Timezone: UTC+7 (Thailand)

### 7. QoS Level
```cpp
// Use QoS 1 for reliability
client.publish(topic.c_str(), payload.c_str(), false); // retained = false
```

---

## 🧪 Test Cases

### Test 1: Complete Flow
```cpp
void testCompleteFlow() {
  Serial.println("=== Starting Complete Flow Test ===");
  
  // 1. Send card data
  sendCardData("7012345678901");
  delay(2000);
  
  // 2. Send weight
  sendWeightData(65.5);
  delay(2000);
  
  // 3. Send height
  sendHeightData(170.0);
  delay(2000);
  
  // 4. Send BP
  sendBPData("120/80");
  delay(2000);
  
  // 5. Send temperature
  sendTempData(36.5);
  delay(2000);

  // 6. Send pulse
  sendPulseData(78);
  delay(2000);
  
  Serial.println("=== Test Complete ===");
  Serial.println("Check Dashboard for results");
}
```

### Test 2: Invalid Data
```cpp
void testInvalidData() {
  // Test without card scan
  sendWeightData(65.5);  // Should print error
  
  // Test with invalid ID card
  sendCardData("123");  // Too short
  
  // Test with invalid BP format
  sendBPData("12080");  // Missing slash
}
```

### Test 3: Rapid Fire
```cpp
void testRapidFire() {
  String testCards[] = {
    "7012345678901",
    "7023456789012",
    "7034567890123"
  };
  
  for (int i = 0; i < 3; i++) {
    sendCardData(testCards[i]);
    delay(1000);
    sendWeightData(60.0 + i * 5);
    delay(1000);
    sendHeightData(165.0 + i * 5);
    delay(1000);
    clearSession();
    delay(2000);
  }
}
```

---

## 📱 Example: Card Reader Device

```cpp
#include <SPI.h>
#include <MFRC522.h>

#define RST_PIN 22
#define SS_PIN 21

MFRC522 mfrc522(SS_PIN, RST_PIN);

void setupCardReader() {
  SPI.begin();
  mfrc522.PCD_Init();
  Serial.println("Card Reader Ready");
}

void loopCardReader() {
  // Look for new cards
  if (!mfrc522.PICC_IsNewCardPresent()) {
    return;
  }
  
  // Select one of the cards
  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }
  
  // Read Thai ID Card
  String idcard = readThaiIDCard();
  
  if (idcard != "") {
    Serial.println("Card detected: " + idcard);
    sendCardData(idcard);
  }
  
  mfrc522.PICC_HaltA();
}

String readThaiIDCard() {
  // Implementation depends on your card reader
  // This is a simplified example
  
  // Thai ID Card typically uses specific sectors
  // You'll need to implement proper reading logic
  
  return "7012345678901"; // Placeholder
}
```

---

## 📦 PlatformIO Configuration (Alternative to Arduino IDE)

### platformio.ini
```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino

lib_deps = 
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.3
    miguelbalboa/MFRC522@^1.4.10

monitor_speed = 115200
upload_speed = 921600
```

---

## 🔐 Security Considerations

### 1. Hardcoded Credentials
```cpp
// ❌ Don't do this in production:
const char* mqtt_pass = "my_password";

// ✅ Better: Store in EEPROM or SPIFFS
#include <Preferences.h>
Preferences preferences;

void setup() {
  preferences.begin("mqtt", false);
  String mqtt_pass = preferences.getString("mqtt_pass", "");
}
```

### 2. WiFi Security
- ใช้ WPA2 เท่านั้น
- ไม่ใช้ Open WiFi
- แนะนำให้ใช้ WiFi แยกสำหรับ medical devices

### 3. MQTT Security
- เปลี่ยน password default
- ใช้ unique password ต่อคลินิก
- พิจารณาใช้ TLS (port 8883) สำหรับ production

---

## 📞 Support

### Technical Issues
- Check Serial Monitor output
- Check MQTT Explorer
- Check Desktop App logs folder
- Contact: tech@clinic.com

### Hardware Issues
- Verify power supply
- Check sensor connections
- Test sensors individually
- Contact hardware vendor

---

## ✅ Pre-Deployment Checklist

### Hardware
- [ ] ESP32 flashed with correct firmware
- [ ] All sensors connected and tested
- [ ] Power supply stable
- [ ] WiFi signal strong at installation location

### Network
- [ ] WiFi credentials configured
- [ ] MQTT broker reachable
- [ ] Desktop app IP address noted
- [ ] Port 1883 not blocked

### Configuration
- [ ] PCU code correct
- [ ] MQTT username/password from Settings page
- [ ] Device type correctly set in code
- [ ] Timezone configured

### Testing
- [ ] WiFi connection successful
- [ ] MQTT connection successful
- [ ] Data appears in Dashboard
- [ ] MySQL updated correctly
- [ ] All sensors working

---

**Document Version**: 1.0  
**Last Updated**: 2024-02-02  
**Compatible with**: Medical Data Collector v1.0+
