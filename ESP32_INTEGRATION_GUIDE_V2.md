# ESP32 Integration Guide V2 - Unified Vitals Topic

**Version**: 2.0 (Simplified - Single Topic Only)  
**Date**: February 9, 2026  
**Compatible**: Medical Data Collector v1.0+

---

## 📋 สารบัญ

1. [Overview](#-overview)
2. [Quick Start](#-quick-start)
3. [API Configuration](#-api-configuration)
4. [MQTT Topic & Format](#-mqtt-topic--format)
5. [Arduino Code](#-arduino-code)
6. [Testing](#-testing)
7. [Troubleshooting](#-troubleshooting)

---

## 🎯 Overview

เอกสารนี้แสดงวิธีการเชื่อมต่อ ESP32 กับระบบ Medical Data Collector โดยใช้ **MQTT Single Topic** แบบใหม่

### ข้อดี

✅ **ง่ายที่สุด** - 1 topic เดียว  
✅ **Flexible** - idcard ไม่จำเป็นต้องส่งทุกครั้ง (ใช้ session ที่มีอยู่)  
✅ **ส่งได้ทั้งหมดหรือบางส่วน** - ส่งเฉพาะค่าที่มี  
✅ **อัพเดตพร้อมกัน** - Atomic updates  
✅ **ประหยัดแบนด์วิธ** - 1 message แทน 5-6 messages  

---

## 🚀 Quick Start

### ขั้นตอนที่ 1: เตรียม ESP32

```bash
# Arduino IDE > Library Manager ติดตั้ง:
- WiFi (built-in)
- PubSubClient (by Nick O'Leary)
- ArduinoJson (by Benoit Blanchon)
```

### ขั้นตอนที่ 2: Config WiFi และ MQTT

```cpp
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "192.168.1.XXX";  // IP ของเครื่องที่รัน Medical Data Collector
const int mqtt_port = 1883;
const char* mqtt_user = "clinic_device";    // จากหน้า Settings
const char* mqtt_pass = "your_password";    // จากหน้า Settings
```

### ขั้นตอนที่ 3: ส่งข้อมูล

```cpp
// ส่งข้อมูล vitals ทั้งหมดหรือบางส่วน
StaticJsonDocument<300> doc;
doc["idcard"] = "7012345678901";
doc["weight"] = 65.5;
doc["height"] = 170.0;
doc["bp"] = "120/80";
doc["temp"] = 36.5;
doc["pulse"] = 78;

String payload;
serializeJson(doc, payload);
client.publish("clinic/vitals/data", payload.c_str());
```

---

## 🌐 API Configuration

### วัตถุประสงค์

หลังจากตั้งค่า PCU Code (เลขประจำตัวของคลินิก) ผ่านหน้า Settings ของ Medical Data Collector คุณสามารถเรียก API เพื่อดึงข้อมูลการตั้งค่า MQTT ของคลินิกนั้น เพื่อไปใช้ในการเชื่อมต่อ ESP32

### API Endpoint

```
GET https://webapp.pfpintranet.com/mdc-api/api/mdc/{pCUCode}
Content-Type: application/json
```

### Request

**URL Parameters:**
- `pCUCode` (String, บังคับ) - เลขประจำตัวคลินิก (เช่น "123456789")

**Example Request:**
```http
GET https://webapp.pfpintranet.com/mdc-api/api/mdc/123456789
Content-Type: application/json
```

### Response Format

```json
{
  "id": 2,
  "pcuCode": "123456789",
  "hostname": "mqtt.local",
  "ip": "192.168.1.99",
  "lastUpdate": "2026-02-10T19:33:31.6256439",
  "createDate": "2026-02-09T23:02:00.2635642"
}
```

### Response Fields

| ฟิลด์ | ประเภท | รายละเอียด |
|-------|--------|----------|
| `id` | Number | ID ของ record |
| `pcuCode` | String | เลขประจำตัวคลินิก |
| `hostname` | String | ชื่อ host หรือ domain name ของ MQTT broker |
| `ip` | String | IP address ของ MQTT broker |
| `lastUpdate` | String | วันเวลาที่อัพเดตข้อมูลล่าสุด (ISO 8601) |
| `createDate` | String | วันเวลาที่สร้าง record (ISO 8601) |

### Error Response

```json
{
  "statusCode": 404,
  "message": "PCU Code not found"
}
```

### HTTP Status Codes

| Code | ความหมาย |
|------|---------|
| 200 | ดึงข้อมูลสำเร็จ |
| 400 | PCU Code ไม่ถูกต้อง |
| 404 | ไม่พบข้อมูล PCU Code |
| 500 | Server error |

---

## 📝 Arduino Implementation

### ตัวอย่าง: ดึง MQTT Config จาก API

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>

// ========== CONFIGURATION ==========
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* api_server = "webapp.pfpintranet.com";
const char* pcu_code = "123456789";  // ตั้งค่านี้จากหน้า Settings

// MQTT Config (จะดึงจาก API)
String mqtt_server = "";
String mqtt_username = "";
int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=== Medical Data Collector - ESP32 V2 ===");
  Serial.println("Fetching MQTT configuration from API...\n");
  
  setupWiFi();
  
  // ดึง MQTT Config จาก API
  if (fetchMQTTConfig()) {
    Serial.println("✓ MQTT Configuration loaded successfully!");
    Serial.print("MQTT Server: ");
    Serial.println(mqtt_server);
    Serial.print("MQTT Port: ");
    Serial.println(mqtt_port);
  } else {
    Serial.println("✗ Failed to fetch MQTT configuration!");
    Serial.println("Using default configuration...");
    mqtt_server = "192.168.1.100";  // Fallback
    mqtt_port = 1883;
  }
  
  client.setServer(mqtt_server.c_str(), mqtt_port);
}

// ========== MAIN LOOP ==========
void loop() {
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();
  
  // ... ส่งข้อมูล vitals
  
  delay(100);
}

// ========== FETCH MQTT CONFIG FROM API ==========
bool fetchMQTTConfig() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected!");
    return false;
  }
  
  HTTPClient http;
  
  // สร้าง URL
  String url = "https://" + String(api_server) + "/mdc-api/api/mdc/" + String(pcu_code);
  
  Serial.println("Sending API request...");
  Serial.println("URL: " + url);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // ส่ง GET request
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    String payload = http.getString();
    Serial.println("Response received:");
    Serial.println(payload);
    
    // Parse JSON response
      StaticJsonDocument<256> doc;
      DeserializationError error = deserializeJson(doc, payload);
      
      if (error) {
        Serial.print("JSON parse error: ");
        Serial.println(error.c_str());
        http.end();
        return false;
      }
      
      // ตรวจสอบว่า response มี hostname
      if (!doc.containsKey("hostname")) {
        Serial.println("API response missing hostname!");
        http.end();
        return false;
      }
      
      // ดึงข้อมูล MQTT
      mqtt_server = doc["hostname"].as<String>();
      String ip = doc["ip"].as<String>();
      mqtt_port = 1883;  // ใช้ default port
    http.end();
    return true;
    
  } else {
    Serial.print("HTTP Request failed! Response code: ");
    Serial.println(httpResponseCode);
    
    String errorMsg = http.getString();
    Serial.println("Error response: ");
    Serial.println(errorMsg);
    
    http.end();
    return false;
  }
}

// ========== WiFi SETUP ==========
void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  int attempts = 0;
  
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n✗ WiFi Connection Failed");
  }
}

// ========== MQTT CONNECTION ==========
void reconnectMQTT() {
  if (client.connected()) return;
  
  Serial.print("Connecting to MQTT broker: ");
  Serial.println(mqtt_server);
  
  String clientId = "ESP32-" + String(random(0xffff), HEX);
  
  if (client.connect(clientId.c_str(), mqtt_username.c_str(), "")) {
    Serial.println("✓ MQTT Connected!");
  } else {
    Serial.print("✗ MQTT Connection Failed (rc=");
    Serial.print(client.state());
    Serial.println(") - Retry in 5s");
    delay(5000);
  }
}
```

### API Call Flow

```
┌─────────────┐
│   ESP32     │
└──────┬──────┘
       │ 1. WiFi Connect
       │
       ├─────────────────────────────────┐
       │                                 │
       v                                 v
   ┌────────────┐              ┌──────────────────┐
   │   WiFi     │              │  Internet        │
   └────────────┘              └──────────────────┘
       │ 2. HTTP Request                │
       │    GET /api/mdc/123456789     │
       ├────────────────────────────────>
       │                                │
       │<────────────────────────────────┤
       │ 3. Response with MQTT Config    │
       │                                 │
       v                                 v
   ┌──────────────┐              ┌──────────────────┐
   │ Save Config  │              │  MDC API Server  │
   │ - hostname   │              │                  │
   │ - IP         │              └──────────────────┘
   └──────┬───────┘
          │ 4. Setup MQTT Connection
          │    host = fetched hostname
          │
          v
   ┌──────────────┐
   │ MQTT Broker  │ ◄─────────────── Ready!
   └──────────────┘
```

### วิธีใช้งาน

1. **ตั้งค่า PCU Code** ในหน้า Settings ของ Medical Data Collector
2. **คัดลอก PCU Code** ไปเซตในตัวแปร `pcu_code` ของ Arduino sketch
3. **Upload code** ไปที่ ESP32
4. **Open Serial Monitor** เพื่อดูการทำงาน
5. **ตรวจสอบ** ว่า MQTT config ดึงมาได้ถูกต้อง

### Expected Output

```
=== Medical Data Collector - ESP32 V2 ===
Fetching MQTT configuration from API...

Connecting to WiFi: HomeNetwork
........
✓ WiFi Connected!
IP Address: 192.168.1.50

Sending API request...
URL: https://webapp.pfpintranet.com/mdc-api/api/mdc/123456789
Response received:
{"id":2,"pcuCode":"123456789","hostname":"mqtt.local","ip":"192.168.1.99","lastUpdate":"2026-02-10T19:33:31.6256439","createDate":"2026-02-09T23:02:00.2635642"}
✓ MQTT Configuration loaded successfully!
MQTT Server: mqtt.local
MQTT Port: 1883

Connecting to MQTT broker: mqtt.local
✓ MQTT Connected!
```

### Error Handling

```cpp
// ตรวจสอบการเชื่อมต่อ WiFi ก่อน
if (WiFi.status() != WL_CONNECTED) {
  Serial.println("Error: WiFi not connected!");
  return false;
}

// ตรวจสอบ HTTP response code
if (httpResponseCode != 200) {
  Serial.print("Error: HTTP ");
  Serial.println(httpResponseCode);
  return false;
}

// ตรวจสอบ JSON parsing
if (error) {
  Serial.print("Error: Invalid JSON - ");
  Serial.println(error.c_str());
  return false;
}

// ตรวจสอบ hostname field มีอยู่หรือไม่
if (!doc.containsKey("hostname")) {
  Serial.println("Error: Missing MQTT hostname in response");
  return false;
}
```

---

## 📡 MQTT Topic & Format

### Topic (เพียง 1 topic เดียว)

```
clinic/vitals/data
```

### JSON Payload Format

```json
{
  "idcard": "7012345678901",
  "weight": 65.5,
  "height": 170.0,
  "bp": "120/80",
  "temp": 36.5,
  "pulse": 78,
  "timestamp": "2024-02-09T10:30:00.000Z"
}
```

### ฟิลด์ทั้งหมด

| ฟิลด์ | ประเภท | บังคับ | รายละเอียด |
|-------|--------|--------|-----------|
| `idcard` | String | ❌ ไม่ | รหัสบัตรประชาชน 13 หลัก (ถ้าไม่ส่ง ใช้ session ที่มีอยู่) |
| `weight` | Number | ❌ ไม่ | น้ำหนัก (กิโลกรัม) |
| `height` | Number | ❌ ไม่ | ส่วนสูง (เซนติเมตร) |
| `bp` | String | ❌ ไม่ | ความดันโลหิต "systolic/diastolic" เช่น "120/80" |
| `temp` | Number | ❌ ไม่ | อุณหภูมิ (องศาเซลเซียส) |
| `pulse` | Number | ❌ ไม่ | ชีพจร (BPM) |
| `timestamp` | String | ❌ ไม่ | ISO 8601 format (ถ้ามี) |

### ตัวอย่าง Payload

**ส่งครบทุกค่า:**
```json
{
  "idcard": "7012345678901",
  "weight": 65.5,
  "height": 170.0,
  "bp": "120/80",
  "temp": 36.5,
  "pulse": 78
}
```

**ส่งเฉพาะน้ำหนัก:**
```json
{
  "idcard": "7012345678901",
  "weight": 67.2
}
```

**ส่งเฉพาะความดันและอุณหภูมิ:**
```json
{
  "idcard": "7012345678901",
  "bp": "118/75",
  "temp": 36.8
}
```

**ส่งโดยไม่ระบุ idcard (ใช้ session ปัจจุบัน):**
```json
{
  "weight": 65.5,
  "bp": "120/80"
}
```

---

## 💻 Arduino Code

### โค้ดสำเร็จรูป (Copy & Use)

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ========== CONFIGURATION ==========
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "192.168.1.100";  // รับจากหน้า setting
const int mqtt_port = 1883;
const char* mqtt_user = "clinic_device";
const char* mqtt_pass = "ABCd1234**";    // Fix

const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 25200;  // GMT+7 (Thailand)
const int daylightOffset_sec = 0;

// ========== GLOBAL VARIABLES ==========
WiFiClient espClient;
PubSubClient client(espClient);
String currentPatient = "";

struct VitalsData {
  float weight = -1;
  float height = -1;
  String bp = "";
  float temp = -1;
  int pulse = -1;
};
VitalsData vitals;

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n=== Medical Data Collector - ESP32 V2 ===");
  Serial.println("Single Topic Mode: clinic/vitals/data");
  
  setupWiFi();
  setupTime();
  client.setServer(mqtt_server, mqtt_port);
}

// ========== MAIN LOOP ==========
void loop() {
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();
  
  // ตัวอย่างการทดสอบผ่าน Serial Monitor
  handleSerialInput();
  
  delay(100);
}

// ========== WiFi SETUP ==========
void setupWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  int attempts = 0;
  
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✓ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n✗ WiFi Connection Failed");
  }
}

// ========== TIME SETUP ==========
void setupTime() {
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  Serial.println("Syncing time with NTP server...");
  delay(2000);
}

// ========== MQTT CONNECTION ==========
void reconnectMQTT() {
  if (client.connected()) return;
  
  Serial.print("Connecting to MQTT broker...");
  String clientId = "ESP32-" + String(random(0xffff), HEX);
  
  if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
    Serial.println(" ✓ Connected!");
  } else {
    Serial.print(" ✗ Failed (rc=");
    Serial.print(client.state());
    Serial.println(") - Retry in 5s");
    delay(5000);
  }
}

// ========== TIMESTAMP GENERATION ==========
String getTimestamp() {
  time_t now = time(nullptr);
  if (now < 1000000000) {
    // Time not synced yet
    return "";
  }
  
  struct tm* timeinfo = localtime(&now);
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S.000Z", timeinfo);
  return String(buffer);
}

// ========== SEND VITALS (MAIN FUNCTION) ==========
void sendVitals(String idcard) {
  // สร้าง JSON document
  StaticJsonDocument<300> doc;
  
  // ส่ง idcard ถ้ามี (ไม่บังคับ)
  if (idcard != "") {
    doc["idcard"] = idcard;
  }
  
  // เพิ่มเฉพาะค่าที่มี
  if (vitals.weight > 0) {
    doc["weight"] = vitals.weight;
  }
  if (vitals.height > 0) {
    doc["height"] = vitals.height;
  }
  if (vitals.bp != "") {
    doc["bp"] = vitals.bp;
  }
  if (vitals.temp > 0) {
    doc["temp"] = vitals.temp;
  }
  if (vitals.pulse > 0) {
    doc["pulse"] = vitals.pulse;
  }
  
  // เพิ่ม timestamp ถ้า sync เวลาสำเร็จ
  String timestamp = getTimestamp();
  if (timestamp != "") {
    doc["timestamp"] = timestamp;
  }
  
  // แปลงเป็น JSON string
  String payload;
  serializeJson(doc, payload);
  
  // ส่งข้อมูล
  Serial.println("\n--- Sending Vitals ---");
  Serial.println("Topic: clinic/vitals/data");
  Serial.println("Payload: " + payload);
  
  if (client.publish("clinic/vitals/data", payload.c_str())) {
    Serial.println("✓ Published Successfully!");
    
    // ล้างข้อมูล vitals หลังส่งสำเร็จ
    vitals = VitalsData();
  } else {
    Serial.println("✗ Publish Failed");
    Serial.println("Check MQTT connection and try again");
  }
}

// ========== HELPER FUNCTIONS ==========
void setPatient(String idcard) {
  currentPatient = idcard;
  vitals = VitalsData();  // รีเซ็ตค่า
  Serial.print("✓ Patient: ");
  Serial.println(idcard);
}

void setWeight(float weight) {
  vitals.weight = weight;
  Serial.print("Weight: ");
  Serial.print(weight, 1);
  Serial.println(" kg");
}

void setHeight(float height) {
  vitals.height = height;
  Serial.print("Height: ");
  Serial.print(height, 1);
  Serial.println(" cm");
}

void setBP(String bp) {
  vitals.bp = bp;
  Serial.print("BP: ");
  Serial.println(bp);
}

void setTemp(float temp) {
  vitals.temp = temp;
  Serial.print("Temperature: ");
  Serial.print(temp, 1);
  Serial.println(" °C");
}

void setPulse(int pulse) {
  vitals.pulse = pulse;
  Serial.print("Pulse: ");
  Serial.print(pulse);
  Serial.println(" bpm");
}

// ========== SERIAL INPUT FOR TESTING ==========
void handleSerialInput() {
  if (!Serial.available()) return;
  
  String input = Serial.readStringUntil('\n');
  input.trim();
  
  // คำสั่งต่างๆ
  if (input.startsWith("ID:")) {
    setPatient(input.substring(3));
  }
  else if (input.startsWith("W:")) {
    setWeight(input.substring(2).toFloat());
  }
  else if (input.startsWith("H:")) {
    setHeight(input.substring(2).toFloat());
  }
  else if (input.startsWith("BP:")) {
    setBP(input.substring(3));
  }
  else if (input.startsWith("T:")) {
    setTemp(input.substring(2).toFloat());
  }
  else if (input.startsWith("P:")) {
    setPulse(input.substring(2).toInt());
  }
  else if (input == "SEND") {
    sendVitals(currentPatient);
  }
  else if (input == "RESET") {
    currentPatient = "";
    vitals = VitalsData();
    Serial.println("✓ Reset all values");
  }
  else if (input == "HELP") {
    printHelp();
  }
  else {
    Serial.println("Unknown command. Type HELP for commands list");
  }
}

void printHelp() {
  Serial.println("\n=== Available Commands ===");
  Serial.println("ID:7012345678901   - Set patient ID card");
  Serial.println("W:65.5             - Set weight (kg)");
  Serial.println("H:170.0            - Set height (cm)");
  Serial.println("BP:120/80          - Set blood pressure");
  Serial.println("T:36.5             - Set temperature (°C)");
  Serial.println("P:78               - Set pulse (bpm)");
  Serial.println("SEND               - Send all vitals to server");
  Serial.println("RESET              - Clear all values");
  Serial.println("HELP               - Show this help");
  Serial.println("========================\n");
}

// ========== ALTERNATIVE: ONE-LINE SEND ==========
// ใช้ฟังก์ชันนี้ถ้าต้องการส่งแบบง่าย ๆ ครั้งเดียว
void sendVitalsQuick(String idcard, float weight, float height, String bp, float temp, int pulse) {
  StaticJsonDocument<300> doc;
  doc["idcard"] = idcard;
  if (weight > 0) doc["weight"] = weight;
  if (height > 0) doc["height"] = height;
  if (bp != "") doc["bp"] = bp;
  if (temp > 0) doc["temp"] = temp;
  if (pulse > 0) doc["pulse"] = pulse;
  
  String timestamp = getTimestamp();
  if (timestamp != "") doc["timestamp"] = timestamp;
  
  String payload;
  serializeJson(doc, payload);
  
  client.publish("clinic/vitals/data", payload.c_str());
}
```

---

## 🧪 Testing

### การทดสอบผ่าน Serial Monitor

1. เปิด Serial Monitor (115200 baud)
2. พิมพ์คำสั่งตามตัวอย่าง:

```
ID:7012345678901
W:65.5
H:170.0
BP:120/80
T:36.5
P:78
SEND
```

### ผลลัพธ์ที่คาดหวัง

```
✓ Patient: 7012345678901
Weight: 65.5 kg
Height: 170.0 cm
BP: 120/80
Temperature: 36.5 °C
Pulse: 78 bpm

--- Sending Vitals ---
Topic: clinic/vitals/data
Payload: {"idcard":"7012345678901","weight":65.5,"height":170.0,"bp":"120/80","temp":36.5,"pulse":78}
✓ Published Successfully!
```

### คำสั่งทดสอบทั้งหมด

| คำสั่ง | รายละเอียด |
|--------|-----------|
| `ID:7012345678901` | ตั้งค่า ID Card |
| `W:65.5` | ตั้งค่าน้ำหนัก |
| `H:170.0` | ตั้งค่าส่วนสูง |
| `BP:120/80` | ตั้งค่าความดัน |
| `T:36.5` | ตั้งค่าอุณหภูมิ |
| `P:78` | ตั้งค่าชีพจร |
| `SEND` | ส่งข้อมูลทั้งหมด |
| `RESET` | ล้างค่าทั้งหมด |
| `HELP` | แสดงคำสั่งทั้งหมด |

---

## 🔍 Troubleshooting

### ปัญหา: WiFi ไม่เชื่อมต่อ

```
✗ WiFi Connection Failed
```

**วิธีแก้:**
- ตรวจสอบ SSID และ Password
- ตรวจสอบสัญญาณ WiFi
- ลอง Restart ESP32

### ปัญหา: MQTT ไม่เชื่อมต่อ

```
✗ Failed (rc=-2) - Retry in 5s
```

**Return Codes:**
- `-4` : Connection Timeout
- `-3` : Connection Lost  
- `-2` : Connect Failed
- `-1` : Disconnected
- `0` : Connected ✓
- `4` : Bad Credentials (ตรวจสอบ username/password)

**วิธีแก้:**
- ตรวจสอบ IP address ของ MQTT broker
- ตรวจสอบ username/password จากหน้า Settings
- ตรวจสอบว่า Medical Data Collector กำลังทำงาน
- ตรวจสอบ Firewall

### ปัญหา: ส่งข้อมูลแล้วไม่ปรากฏบน Dashboard

```
✓ Published Successfully!
แต่ไม่เห็นข้อมูลบน Dashboard
```

**วิธีแก้:**
1. ตรวจสอบว่า Medical Data Collector กำลังทำงาน
2. ตรวจสอบ log ของโปรแกรม
3. ตรวจสอบว่า ID Card มีในฐานข้อมูล person table
4. ลองส่งข้อมูลผ่าน MQTT Explorer ก่อน

### ปัญหา: Timestamp ไม่ถูกต้อง

```
timestamp: "1970-01-01T00:00:00.000Z"
```

**วิธีแก้:**
- รอให้ NTP sync (ประมาณ 10-30 วินาที)
- ตรวจสอบการเชื่อมต่อ internet
- ลอง Restart ESP32

---

## 📊 ตัวอย่างการใช้งานจริง

### ตัวอย่าง 1: เครื่องชั่งน้ำหนัก + วัดส่วนสูง

```cpp
void loop() {
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();
  
  // อ่านบัตรประชาชน (จาก RFID reader)
  String idcard = readIDCard();
  if (idcard != "" && idcard != currentPatient) {
    setPatient(idcard);
  }
  
  // อ่านน้ำหนัก (จาก Load Cell)
  if (isWeightStable()) {
    float weight = readWeight();
    setWeight(weight);
  }
  
  // อ่านส่วนสูง (จาก Ultrasonic sensor)
  if (isHeightStable()) {
    float height = readHeight();
    setHeight(height);
  }
  
  // ถ้ามีค่าครบแล้ว → ส่งอัตโนมัติ
  if (currentPatient != "" && vitals.weight > 0 && vitals.height > 0) {
    sendVitals(currentPatient);
    delay(3000);  // รอ 3 วินาทีก่อนวัดคนต่อไป
    currentPatient = "";
  }
}
```

### ตัวอย่าง 2: เครื่องวัดความดัน + อุณหภูมิ + ชีพจร

```cpp
void loop() {
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();
  
  // อ่านบัตร
  String idcard = readIDCard();
  if (idcard != "") {
    setPatient(idcard);
    
    // วัดความดัน
    String bp = measureBP();
    if (bp != "") {
      setBP(bp);
    }
    
    // วัดอุณหภูมิ
    float temp = measureTemp();
    if (temp > 0) {
      setTemp(temp);
    }
    
    // วัดชีพจร
    int pulse = measurePulse();
    if (pulse > 0) {
      setPulse(pulse);
    }
    
    // ส่งข้อมูล
    sendVitals(idcard);
    
    // รอครั้งถัดไป
    delay(5000);
  }
}
```

### ตัวอย่าง 3: ส่งแบบ One-Shot

```cpp
void loop() {
  // เมื่อกดปุ่ม
  if (buttonPressed()) {
    String id = "7012345678901";
    float w = readWeight();
    float h = readHeight();
    String bp = measureBP();
    float t = measureTemp();
    int p = measurePulse();
    
    // ส่งทีเดียว
    sendVitalsQuick(id, w, h, bp, t, p);
    
    delay(1000);
  }
}
```

---

## 🔐 Security Best Practices

### 1. ไม่ Hardcode Credentials

```cpp
// ❌ ไม่ดี
const char* mqtt_pass = "mypassword123";

// ✅ ดีกว่า - เก็บใน EEPROM
#include <Preferences.h>
Preferences prefs;

void setup() {
  prefs.begin("config", false);
  String mqtt_pass = prefs.getString("mqtt_pass", "");
}
```

### 2. ใช้ Strong Password

```
❌ ไม่ดี: 1234, password, admin
✅ ดี: cL!n1c_2024_$Tr0ng
```

### 3. Network Security

- ใช้ WPA2/WPA3 สำหรับ WiFi
- แยก Network สำหรับ Medical Devices
- ใช้ VPN สำหรับ Remote Access

---

## 📱 Integration Examples

### PlatformIO Configuration

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino

lib_deps = 
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^6.21.3

monitor_speed = 115200
```

### ตัวอย่าง Hardware Connections

```
ESP32 Pinout:
- GPIO21 (SDA) → RFID Reader SDA
- GPIO22 (SCL) → RFID Reader SCL
- GPIO34 (Input) → Button
- GPIO32 → Load Cell DT
- GPIO33 → Load Cell SCK
- GPIO25 → Temperature Sensor
```

---

## 🎓 FAQs

### Q: ต้องส่ง idcard ทุกครั้งหรือไม่?

**A:** ไม่จำเป็น! สามารถส่งหรือไม่ส่งก็ได้
- **ส่ง idcard**: ระบบจะสร้างหรืออัปเดต session ของ idcard นั้น
- **ไม่ส่ง idcard**: ระบบจะอัปเดตข้อมูลใน session ปัจจุบันที่เปิดอยู่

ตัวอย่าง use case:
- ครั้งแรก: ส่ง idcard + weight (สร้าง session ใหม่)
- ครั้งที่สอง: ส่งแค่ bp, temp (อัปเดต session เดิม โดยไม่ต้องส่ง idcard ซ้ำ)

### Q: ส่งได้แค่บางค่าหรือไม่ (เช่น แค่น้ำหนัก)?

**A:** ได้! ส่งเฉพาะค่าที่มีก็พอ ไม่จำเป็นต้องครบทุกค่า

### Q: ต้องสแกนบัตรก่อนหรือไม่?

**A:** ไม่ต้อง! Version 2 มี 2 วิธีใช้งาน:
- **วิธีที่ 1**: ส่ง idcard มาใน payload (ไม่ต้องสแกนบัตรแยก)
- **วิธีที่ 2**: ไม่ส่ง idcard เลย (ใช้กับ session ที่เปิดอยู่)

เหมาะกับการใช้งานที่มีหลายเครื่องวัดต่อกัน โดยไม่ต้องสแกนบัตรซ้ำทุกเครื่อง

### Q: ระบบรองรับ MySQL offline หรือไม่?

**A:** รองรับ! ระบบจะบันทึกลง pending queue และ replay อัตโนมัติเมื่อ MySQL กลับมา online

### Q: ส่งข้อมูลซ้ำหลายครั้งได้หรือไม่?

**A:** ได้ แต่ครั้งหลังจะเป็นการ update ข้อมูลเดิม

---

## ✅ Checklist ก่อน Deploy

### Hardware
- [ ] ESP32 ทำงานปกติ
- [ ] Sensors เชื่อมต่อและทดสอบแล้ว
- [ ] Power supply มั่นคง
- [ ] สัญญาณ WiFi แรง

### Software
- [ ] อัพโหลด firmware สำเร็จ
- [ ] Config WiFi ถูกต้อง
- [ ] Config MQTT ถูกต้อง (IP, username, password)
- [ ] ทดสอบผ่าน Serial Monitor แล้ว

### Network
- [ ] WiFi เชื่อมต่อได้
- [ ] Ping ถึง MQTT broker ได้
- [ ] Port 1883 ไม่ blocked
- [ ] Medical Data Collector กำลังทำงาน

### Testing
- [ ] ส่งข้อมูลทดสอบสำเร็จ
- [ ] ข้อมูลปรากฏบน Dashboard
- [ ] MySQL บันทึกข้อมูลถูกต้อง
- [ ] ทดสอบกรณี offline/online

---

## 📞 Support

**Technical Support:**
- GitHub Issues: https://github.com/bonmvsk/Medical-Data-Collector
- Email: support@clinic.com

**Documentation:**
- [MQTT Testing Guide](./TEST_UNIFIED_VITALS.md)
- [Node-RED Flow](./NODE_RED_MQTT_FLOW.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

---

**Version**: 2.0  
**Last Updated**: February 9, 2026  
**Author**: Medical Data Collector Team
