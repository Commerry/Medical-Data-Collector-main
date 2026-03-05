/**
 * ESP32/ESP8266 RS232 to HTTP POST
 * 
 * อ่านข้อมูล Text/JSON จาก RS232 และส่งไปยัง Center ผ่าน HTTP POST
 * 
 * =============================================================================
 * 🎯 การแบ่งงาน (โดยอัตโนมัติ):
 * =============================================================================
 * 
 * ✅ ESP32 → เครื่องวัดความดัน (Blood Pressure Monitor)
 *    - Baud: 115200
 *    - Pin: GPIO16 (RX), GPIO17 (TX)
 *    - Buffer: ใหญ่ (รองรับ JSON 400+ bytes)
 *    - ใช้: RS232Reader_BP.h
 * 
 * ✅ ESP8266 → เครื่องชั่ง/ส่วนสูง (Weight Scale & Height Meter)
 *    - Baud: 9600
 *    - Pin: D7/GPIO13 (RX), D8/GPIO15 (TX)
 *    - Buffer: 64 bytes (รองรับ Text สั้นๆ)
 *    - ใช้: RS232Reader_Weight.h
 * 
 * =============================================================================
 * 🔧 วิธีเลือกอุปกรณ์:
 * =============================================================================
 * 
 * วิธีที่ 1: เลือก Board ใน Arduino IDE (แนะนำ)
 *   • ESP32 Dev Module → จะใช้ RS232Reader_BP.h อัตโนมัติ
 *   • NodeMCU 1.0 → จะใช้ RS232Reader_Weight.h อัตโนมัติ
 * 
 * วิธีที่ 2: แก้โค้ดด้านล่าง (กรณีต้องการสลับ)
 *   • Uncomment #include ที่ต้องการ
 *   • Comment #include ที่ไม่ใช้
 * 
 * =============================================================================
 * ฮาร์ดแวร์:
 * =============================================================================
 * 
 * MAX3232 Module (RS232-to-TTL Converter):
 *   - VCC → 5V
 *   - GND → GND
 *   - TTL-R1 → ESP RX Pin
 *   - TTL-T1 → ESP TX Pin
 *   - RS232 Side → เครื่องมือแพทย์
 * 
 * ESP32:
 *   - RX: GPIO16, TX: GPIO17
 *   - Reset Config: BOOT/GPIO0 (กดค้าง 3 วินาที)
 * 
 * ESP8266:
 *   - RX: D7/GPIO13, TX: D8/GPIO15
 *   - Reset Config: D2/GPIO4 (กดค้าง 3 วินาที)
 * 
 * =============================================================================
 * Library ที่ต้องติดตั้ง:
 * =============================================================================
 * ทั้ง ESP32 และ ESP8266:
 * - ArduinoJson by Benoit Blanchon
 * 
 * สำหรับ ESP8266 เท่านั้น:
 * - EspSoftwareSerial by Dirk Kaar
 * 
 * =============================================================================
 */

// ===== เลือกบอร์ดอัตโนมัติ =====
#ifdef ESP32
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <EEPROM.h>
  #define EEPROM_SIZE 512
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClient.h>
  #include <SoftwareSerial.h>
  #include <EEPROM.h>
  #define EEPROM_SIZE 512
#endif

#include "Config.h"

// =============================================================================
// 🔧 เลือกอุปกรณ์ (แก้ได้ถ้าต้องการสลับ)
// =============================================================================

#ifdef ESP32
  // ✅ ESP32 → เครื่องวัดความดัน (Baud: 115200, JSON 400+ bytes)
  #include "RS232Reader_BP.h"
#elif defined(ESP8266)
  // ✅ ESP8266 → เครื่องชั่ง (Baud: 9600, Text < 64 bytes)
  #include "RS232Reader_Weight.h"
#endif

// =============================================================================

// ===== LED & Button Pins =====
#ifdef ESP32
  #define GREEN_LED_PIN 2     // GPIO2 (Built-in LED)
  #define BOOT_BTN 0          // GPIO0 (BOOT button)
#elif defined(ESP8266)
  #define GREEN_LED_PIN D6    // D6/GPIO12
  #define BOOT_BTN D2         // D2/GPIO4
#endif

unsigned long lastButtonCheck = 0;
int httpPostCount = 0;
unsigned long lastLedBlink = 0;
bool ledBlinkState = false;

// ===== Auto-Reconnect Variables =====
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 10000;  // ตรวจสอบทุก 10 วินาที
int wifiReconnectCount = 0;
bool isReconnecting = false;

// ===== Buffer สำหรับเก็บข้อมูล Weight/Height (ESP8266) =====
#ifdef ESP8266
float bufferedWeight = 0;
float bufferedHeight = 0;
bool hasBufferedWeight = false;
bool hasBufferedHeight = false;
unsigned long lastBufferTime = 0;
const unsigned long BUFFER_TIMEOUT = 5000;  // timeout 5 วินาที
#endif

// ===== ฟังก์ชันตรวจสอบและ Reconnect WiFi =====
bool ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    isReconnecting = false;
    return true;
  }
  
  if (isReconnecting) {
    Serial.println("   ⏳ กำลัง reconnect WiFi อยู่...");
    return false;
  }
  
  Serial.println("\n⚠️  WiFi หลุดการเชื่อมต่อ!");
  Serial.println("🔄 พยายาม Reconnect...");
  isReconnecting = true;
  wifiReconnectCount++;
  
  // กระพริบ LED เร็วๆ เพื่อแสดงว่ากำลัง reconnect
  for (int i = 0; i < 5; i++) {
    digitalWrite(GREEN_LED_PIN, HIGH);
    delay(50);
    digitalWrite(GREEN_LED_PIN, LOW);
    delay(50);
  }
  
  WiFi.disconnect();
  delay(100);
  WiFi.begin(CENTER_SSID, CENTER_PASSWORD);
  
  // รอ 10 วินาที
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("✅ Reconnect สำเร็จ!");
    Serial.printf("   IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("   Reconnect ครั้งที่: %d\n", wifiReconnectCount);
    isReconnecting = false;
    lastLedBlink = millis();
    return true;
  } else {
    Serial.println("❌ Reconnect ล้มเหลว - จะลองใหม่อีกครั้ง...");
    isReconnecting = false;
    return false;
  }
}

// ===== ฟังก์ชันส่งข้อมูล BP พร้อม ID Card (มี Retry) =====
void sendBPData(String jsonData) {
  // ตรวจสอบและ reconnect WiFi ถ้าจำเป็น
  if (!ensureWiFiConnected()) {
    Serial.println("⚠️  WiFi ไม่ได้เชื่อมต่อ - ข้ามการส่งข้อมูล");
    return;
  }
  
  // Parse JSON ที่ได้จาก RS232Reader_BP.h
  #ifdef ESP32
    StaticJsonDocument<512> inDoc;
  #else
    StaticJsonDocument<300> inDoc;  // ESP8266 ใช้ buffer เล็กกว่า
  #endif
  
  DeserializationError error = deserializeJson(inDoc, jsonData);
  
  if (error) {
    Serial.println("❌ JSON Parse Error: " + String(error.c_str()));
    return;
  }
  
  ConfigData* cfg = Config_get();
  
  // สร้าง URL
  String url = String("http://") + CENTER_IP + "/api/vitals";
  
  // สร้าง JSON Payload สำหรับเครื่องวัดความดัน
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<300> doc;
  #endif
  doc["deviceId"] = WiFi.macAddress();
  doc["deviceName"] = cfg->deviceName;
  doc["macAddress"] = WiFi.macAddress();
  doc["deviceType"] = "blood_pressure";
  
  // ส่ง ID Card ด้วย (สำคัญ!)
  if (inDoc.containsKey("idcard")) {
    doc["idcard"] = inDoc["idcard"].as<String>();
  } else {
    doc["idcard"] = "";
  }
  
  // สร้าง nested data object
  JsonObject dataObj = doc.createNestedObject("data");
  
  if (inDoc.containsKey("bp")) {
    dataObj["bp"] = inDoc["bp"].as<int>();
  }
  if (inDoc.containsKey("bp2")) {
    dataObj["bp2"] = inDoc["bp2"].as<int>();
  }
  if (inDoc.containsKey("pulse")) {
    dataObj["pulse"] = inDoc["pulse"].as<int>();
  }
  
  dataObj["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("\n📤 ส่งข้อมูล BP ไปยัง Center:");
  serializeJsonPretty(doc, Serial);
  Serial.println();
  
  // ส่ง HTTP POST พร้อม Retry (3 ครั้ง)
  bool success = false;
  int retryCount = 0;
  const int MAX_RETRIES = 3;
  
  while (!success && retryCount < MAX_RETRIES) {
    if (retryCount > 0) {
      Serial.printf("   🔄 Retry ครั้งที่ %d/%d...\n", retryCount, MAX_RETRIES - 1);
      delay(1000);  // รอ 1 วินาทีก่อน retry
      
      // ตรวจสอบ WiFi อีกครั้งก่อน retry
      if (!ensureWiFiConnected()) {
        Serial.println("   ⚠️  WiFi ยังไม่พร้อม - ข้าม retry");
        break;
      }
    }
    
    HTTPClient http;
    WiFiClient client;
    http.begin(client, url);
    
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);
    
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
      httpPostCount++;
      Serial.printf("✅ ส่งข้อมูล BP #%d สำเร็จ", httpPostCount);
      if (retryCount > 0) {
        Serial.printf(" (หลัง retry %d ครั้ง)", retryCount);
      }
      Serial.println();
      blinkLEDOnce();
      success = true;
    } else if (httpCode > 0) {
      Serial.printf("❌ HTTP Error: %d\n", httpCode);
      String response = http.getString();
      if (response.length() > 0) {
        Serial.println("   Response: " + response);
      }
    } else {
      Serial.println("❌ การเชื่อมต่อล้มเหลว");
      Serial.printf("   Error: %s\n", http.errorToString(httpCode).c_str());
    }
    
    http.end();
    retryCount++;
  }
  
  if (!success) {
    Serial.printf("❌ ส่งข้อมูล BP ล้มเหลวหลังพยายาม %d ครั้ง\n", MAX_RETRIES);
    Serial.println("   💡 กรุณาตรวจสอบ:");
    Serial.printf("      - Center IP: %s พร้อมใช้งานหรือไม่\n", CENTER_IP);
    Serial.println("      - Network connection");
  }
}

// ===== ฟังก์ชันส่งข้อมูลแต่ละ Field (สำหรับ Weight/Height/Temp) พร้อม Retry =====
void sendHTTPPost(String deviceType, float value) {
  // ตรวจสอบและ reconnect WiFi ถ้าจำเป็น
  if (!ensureWiFiConnected()) {
    Serial.println("⚠️  WiFi ไม่ได้เชื่อมต่อ - ข้ามการส่งข้อมูล");
    return;
  }
  
  ConfigData* cfg = Config_get();
  
  // สร้าง URL
  String url = String("http://") + CENTER_IP + "/api/vitals";
  
  // สร้าง JSON Payload
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<250> doc;  // ESP8266: weight/height/temp ใช้ buffer เล็ก
  #endif
  doc["deviceId"] = WiFi.macAddress();
  doc["deviceName"] = cfg->deviceName;
  doc["macAddress"] = WiFi.macAddress();
  doc["deviceType"] = deviceType;
  doc["idcard"] = "";  // RS232 ไม่มีข้อมูล ID Card
  
  JsonObject dataObj = doc.createNestedObject("data");
  dataObj["value"] = value;
  dataObj["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  // ส่ง HTTP POST พร้อม Retry (3 ครั้ง)
  bool success = false;
  int retryCount = 0;
  const int MAX_RETRIES = 3;
  
  while (!success && retryCount < MAX_RETRIES) {
    if (retryCount > 0) {
      Serial.printf("   🔄 Retry ครั้งที่ %d/%d...\n", retryCount, MAX_RETRIES - 1);
      delay(1000);
      
      if (!ensureWiFiConnected()) {
        Serial.println("   ⚠️  WiFi ยังไม่พร้อม - ข้าม retry");
        break;
      }
    }
    
    HTTPClient http;
    WiFiClient client;
    http.begin(client, url);
    
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);
    
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
      httpPostCount++;
      Serial.printf("✅ ส่งข้อมูล #%d สำเร็จ", httpPostCount);
      if (retryCount > 0) {
        Serial.printf(" (หลัง retry %d ครั้ง)", retryCount);
      }
      Serial.println();
      Serial.printf("   Type: %s\n", deviceType.c_str());
      Serial.printf("   Value: %.1f\n", value);
      blinkLEDOnce();
      success = true;
    } else if (httpCode > 0) {
      Serial.printf("❌ HTTP Error: %d\n", httpCode);
      String response = http.getString();
      if (response.length() > 0) {
        Serial.println("   Response: " + response);
      }
    } else {
      Serial.println("❌ การเชื่อมต่อล้มเหลว");
      Serial.printf("   Error: %s\n", http.errorToString(httpCode).c_str());
    }
    
    http.end();
    retryCount++;
  }
  
  if (!success) {
    Serial.printf("❌ ส่งข้อมูล %s ล้มเหลวหลังพยายาม %d ครั้ง\n", deviceType.c_str(), MAX_RETRIES);
    Serial.println("   💡 กรุณาตรวจสอบ:");
    Serial.printf("      - Center IP: %s พร้อมใช้งานหรือไม่\n", CENTER_IP);
    Serial.println("      - Network connection");
  }
}

// ===== ฟังก์ชันส่งข้อมูล Weight + Height พร้อมกัน (ESP8266) =====
#ifdef ESP8266
void sendWeightHeight(float weight, float height, bool hasTemp, float temp) {
  // ตรวจสอบและ reconnect WiFi ถ้าจำเป็น
  if (!ensureWiFiConnected()) {
    Serial.println("⚠️  WiFi ไม่ได้เชื่อมต่อ - ข้ามการส่งข้อมูล");
    return;
  }
  
  ConfigData* cfg = Config_get();
  
  // สร้าง URL
  String url = String("http://") + CENTER_IP + "/api/vitals";
  
  // สร้าง JSON Payload รวม Weight + Height
  StaticJsonDocument<300> doc;
  doc["deviceId"] = WiFi.macAddress();
  doc["deviceName"] = cfg->deviceName;
  doc["macAddress"] = WiFi.macAddress();
  doc["deviceType"] = "weight_height";  // ประเภทรวม
  doc["idcard"] = "";  // ไม่มี ID Card
  
  JsonObject dataObj = doc.createNestedObject("data");
  dataObj["weight"] = weight;
  dataObj["height"] = height;
  if (hasTemp) {
    dataObj["temp"] = temp;
  }
  dataObj["timestamp"] = millis();
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.println("\n📤 ส่งข้อมูล Weight + Height รวมกัน:");
  serializeJsonPretty(doc, Serial);
  Serial.println();
  
  // ส่ง HTTP POST พร้อม Retry
  bool success = false;
  int retryCount = 0;
  const int MAX_RETRIES = 3;
  
  while (!success && retryCount < MAX_RETRIES) {
    if (retryCount > 0) {
      Serial.printf("   🔄 Retry ครั้งที่ %d/%d...\n", retryCount, MAX_RETRIES - 1);
      delay(1000);
      
      if (!ensureWiFiConnected()) {
        Serial.println("   ⚠️  WiFi ยังไม่พร้อม - ข้าม retry");
        break;
      }
    }
    
    HTTPClient http;
    WiFiClient client;
    http.begin(client, url);
    
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);
    
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
      httpPostCount++;
      Serial.printf("✅ ส่งข้อมูล Weight+Height #%d สำเร็จ", httpPostCount);
      if (retryCount > 0) {
        Serial.printf(" (หลัง retry %d ครั้ง)", retryCount);
      }
      Serial.println();
      Serial.printf("   Weight: %.1f kg\n", weight);
      Serial.printf("   Height: %.1f cm\n", height);
      if (hasTemp) {
        Serial.printf("   Temp: %.1f °C\n", temp);
      }
      blinkLEDOnce();
      success = true;
    } else if (httpCode > 0) {
      Serial.printf("❌ HTTP Error: %d\n", httpCode);
      String response = http.getString();
      if (response.length() > 0) {
        Serial.println("   Response: " + response);
      }
    } else {
      Serial.println("❌ การเชื่อมต่อล้มเหลว");
      Serial.printf("   Error: %s\n", http.errorToString(httpCode).c_str());
    }
    
    http.end();
    retryCount++;
  }
  
  if (!success) {
    Serial.printf("❌ ส่งข้อมูล Weight+Height ล้มเหลวหลังพยายาม %d ครั้ง\n", MAX_RETRIES);
    Serial.println("   💡 กรุณาตรวจสอบ:");
    Serial.printf("      - Center IP: %s พร้อมใช้งานหรือไม่\n", CENTER_IP);
    Serial.println("      - Network connection");
  }
}
#endif

// ===== Callback เมื่อได้รับข้อมูล RS232 =====
void onRS232DataReceived(String jsonData) {
  Serial.println("\n📤 กำลังส่งข้อมูลไปยัง Center...");
  
  // Parse JSON
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<200> doc;  // ESP8266: parse weight/height/temp data
  #endif
  DeserializationError error = deserializeJson(doc, jsonData);
  
  if (error) {
    Serial.println("❌ JSON Parse Error: " + String(error.c_str()));
    return;
  }
  
  #ifdef ESP32
    // ===== ESP32: เครื่องวัดความดัน - ส่งรวมกัน 1 ครั้ง พร้อม ID Card =====
    sendBPData(jsonData);
    
  #elif defined(ESP8266)
    // ===== ESP8266: เครื่องชั่ง - ต้องมีทั้ง Weight และ Height ถึงจะส่ง =====
    bool hasWeight = doc.containsKey("weight");
    bool hasHeight = doc.containsKey("height");
    bool hasTemp = doc.containsKey("temp");
    
    float weight = hasWeight ? doc["weight"].as<float>() : 0;
    float height = hasHeight ? doc["height"].as<float>() : 0;
    float temp = hasTemp ? doc["temp"].as<float>() : 0;
    
    // ถ้ามีทั้ง Weight และ Height → ส่งทันที
    if (hasWeight && hasHeight) {
      Serial.println("✅ ได้ทั้ง Weight และ Height → ส่งรวมกันทันที");
      sendWeightHeight(weight, height, hasTemp, temp);
      
      // Clear buffer
      hasBufferedWeight = false;
      hasBufferedHeight = false;
      bufferedWeight = 0;
      bufferedHeight = 0;
    }
    // ถ้ามีแค่ Weight → เก็บ buffer รอ Height
    else if (hasWeight && !hasHeight) {
      Serial.println("⏳ ได้ Weight แล้ว → รอ Height...");
      bufferedWeight = weight;
      hasBufferedWeight = true;
      lastBufferTime = millis();
      
      // ถ้ามี Height ใน buffer อยู่แล้ว → ส่งเลย
      if (hasBufferedHeight) {
        Serial.println("✅ มี Height ใน buffer แล้ว → ส่งรวมกัน");
        sendWeightHeight(bufferedWeight, bufferedHeight, hasTemp, temp);
        hasBufferedWeight = false;
        hasBufferedHeight = false;
        bufferedWeight = 0;
        bufferedHeight = 0;
      }
    }
    // ถ้ามีแค่ Height → เก็บ buffer รอ Weight
    else if (!hasWeight && hasHeight) {
      Serial.println("⏳ ได้ Height แล้ว → รอ Weight...");
      bufferedHeight = height;
      hasBufferedHeight = true;
      lastBufferTime = millis();
      
      // ถ้ามี Weight ใน buffer อยู่แล้ว → ส่งเลย
      if (hasBufferedWeight) {
        Serial.println("✅ มี Weight ใน buffer แล้ว → ส่งรวมกัน");
        sendWeightHeight(bufferedWeight, bufferedHeight, hasTemp, temp);
        hasBufferedWeight = false;
        hasBufferedHeight = false;
        bufferedWeight = 0;
        bufferedHeight = 0;
      }
    }
    // ถ้ามีแค่ Temp เดี่ยว → ส่งแยก (ไม่สำคัญ)
    else if (hasTemp && !hasWeight && !hasHeight) {
      Serial.println("ℹ️  มีแค่ Temp → ส่งแยก");
      sendHTTPPost("temp", temp);
    }
  #endif
  
  Serial.println("✅ ส่งข้อมูลครบทั้งหมดแล้ว\n");
}

// ===== Setup =====
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n================================================================================");
  #ifdef ESP32
    Serial.println("  ESP32 RS232 to HTTP POST - Blood Pressure Monitor");
  #elif defined(ESP8266)
    Serial.println("  ESP8266 RS232 to HTTP POST - Weight Scale");
  #endif
  Serial.println("================================================================================\n");
  
  // ตั้งค่าปุ่ม Reset
  pinMode(BOOT_BTN, INPUT_PULLUP);
  
  // ตั้งค่า LED
  setupLED();
  
  #ifdef ESP32
    Serial.println("💡 กดปุ่ม BOOT (GPIO0) ค้าง 3 วินาที = Reset Config\n");
  #elif defined(ESP8266)
    Serial.println("💡 กดปุ่ม D2 ค้าง 3 วินาที = Reset Config\n");
  #endif
  
  // โหลด Config
  Config_begin();
  
  // เชื่อมต่อ WiFi (Fixed) - ข้ามถ้าไม่สำเร็จ เพื่อทดสอบ RS232
  Serial.println("🔌 กำลังเชื่อมต่อ WiFi...");
  if (!Config_connectWiFi()) {
    Serial.println("⚠️  ไม่สามารถเชื่อมต่อ WiFi ได้");
    Serial.println("✅ ข้าม WiFi - ดำเนินการทดสอบ RS232 ต่อ...\n");
    // ไม่ restart เพื่อให้ทดสอบ RS232 ได้
  } else {
    // ตั้งค่า WiFi Auto-Reconnect
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
  }
  
  // เริ่มต้น RS232
  RS232_begin();
  RS232_setCallback(onRS232DataReceived);
  
  Serial.println("\n✅ พร้อมใช้งาน!");
  Serial.println("💡 พิมพ์ 'reset' ใน Serial Monitor เพื่อ Reset Config");
  Serial.println("================================================================================\n");
  
  Serial.println("🔧 กำลังเริ่มต้น RS232 Loop...");
  Serial.println("   - ถ้ามีข้อมูลจาก RS232 จะแสดงทันที");
  Serial.println("   - ข้อมูลจะแสดงแบบ real-time เหมือน RS232-to-USB\n");
}

// ===== Loop =====
void loop() {
  // ตรวจสอบคำสั่งจาก Serial Monitor
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    command.toLowerCase();
    
    if (command == "reset") {
      Serial.println("\n🔄 ได้รับคำสั่ง Reset Config จาก Serial Monitor");
      Config_reset();
      delay(1000);
      ESP.restart();
    }
  }
  
  // อัพเดท LED
  updateLED();
  
  // ===== ESP8266: ตรวจสอบ Buffer Timeout =====
  #ifdef ESP8266
  if ((hasBufferedWeight || hasBufferedHeight) && lastBufferTime > 0) {
    if (millis() - lastBufferTime > BUFFER_TIMEOUT) {
      Serial.println("\n⏰ Buffer Timeout (5 วินาที)!");
      
      // ถ้ามีแค่ตัวเดียว → ไม่ส่ง (รอให้ครบ)
      if (hasBufferedWeight && !hasBufferedHeight) {
        Serial.println("   ⚠️  มีแค่ Weight ไม่มี Height → ไม่ส่ง (ต้องมีทั้งคู่)");
      } else if (!hasBufferedWeight && hasBufferedHeight) {
        Serial.println("   ⚠️  มีแค่ Height ไม่มี Weight → ไม่ส่ง (ต้องมีทั้งคู่)");
      }
      
      // Clear buffer
      hasBufferedWeight = false;
      hasBufferedHeight = false;
      bufferedWeight = 0;
      bufferedHeight = 0;
      lastBufferTime = 0;
    }
  }
  #endif
  
  // ตรวจสอบปุ่มกดค้าง 3 วินาที = Reset Config
  if (digitalRead(BOOT_BTN) == LOW) {
    if (millis() - lastButtonCheck > 3000) {
      #ifdef ESP32
        Serial.println("\n🔄 กำลัง Reset Config (BOOT Button)...");
      #elif defined(ESP8266)
        Serial.println("\n🔄 กำลัง Reset Config (D2 Button)...");
      #endif
      Config_reset();
      ESP.restart();
    }
  } else {
    lastButtonCheck = millis();
  }
  
  // ตรวจสอบสถานะ WiFi อย่างสม่ำเสมอ (Auto-reconnect)
  if (millis() - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
    lastWiFiCheck = millis();
    
    // พยายาม reconnect ถ้า WiFi หลุด
    ensureWiFiConnected();
    
    // แสดงสถานะ RS232 ก่อนเสมอ
    Serial.println("\n📊 สถานะระบบ:");
    
    long currentBaud = RS232_getCurrentBaudRate();
    int byteCount = RS232_getByteCount();
    int validCount = RS232_getValidDataCount();
    
    Serial.printf("   📡 Baud Rate: %ld\n", currentBaud);
    Serial.printf("   📊 Bytes รับทั้งหมด: %d bytes\n", byteCount);
    Serial.printf("   ✅ ข้อมูล Valid: %d ครั้ง\n", validCount);
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("   📶 WiFi: Connected (RSSI: %d dBm)\n", WiFi.RSSI());
      Serial.printf("   🌐 Center IP: %s\n", CENTER_IP);
      Serial.printf("   📤 ส่งข้อมูลแล้ว: %d ครั้ง\n", httpPostCount);
      if (wifiReconnectCount > 0) {
        Serial.printf("   🔄 WiFi Reconnect: %d ครั้ง\n", wifiReconnectCount);
      }
    } else {
      Serial.println("   ⚠️  WiFi: Disconnected (พยายาม reconnect อัตโนมัติ...)");
    }
    
    if (byteCount == 0) {
      Serial.println("\n   ⚠️  ยังไม่มีข้อมูลเข้ามา - ตรวจสอบ:");
      Serial.println("      1. สาย RS232: TX → RX, RX → TX (ต้องสลับข้าม!)");
      Serial.println("      2. MAX3232: มีไฟเลี้ยง (VCC, GND)");
      Serial.println("      3. อุปกรณ์: เปิดเครื่องและกำลังส่งข้อมูลหรือไม่");
      #ifdef ESP32
        Serial.println("      4. Baud Rate: ตรง 115200 หรือไม่ (เครื่องวัดความดัน)");
      #elif defined(ESP8266)
        Serial.println("      4. Baud Rate: ตรง 9600 หรือไม่ (เครื่องชั่ง)");
      #endif
    } else if (validCount == 0 && byteCount > 0) {
      Serial.println("\n   ⚠️  มีข้อมูลเข้ามาแต่ parse ไม่ได้:");
      #ifdef ESP32
        Serial.println("      - กำลังรอข้อมูลครบ (รอ '}' ของ JSON)");
        Serial.println("      - หรือข้อมูลไม่ใช่ JSON format");
      #elif defined(ESP8266)
        Serial.println("      - กำลังรอข้อมูลครบ (รอ newline)");
        Serial.println("      - หรือข้อมูลไม่ใช่รูปแบบ W:xxx H:xxx");
      #endif
    }
    
    Serial.println();
  }
  
  // อ่านข้อมูล RS232 (passive receiver - รับข้อมูลที่ส่งมาอย่างเดียว)
  RS232_loop();
  
  // แสดงสถานะการอ่าน RS232 ทุก 10 วินาที
  static unsigned long lastDebug = 0;
  static unsigned long loopCount = 0;
  loopCount++;
  
  if (millis() - lastDebug > 10000) {
    lastDebug = millis();
    int byteCount = RS232_getByteCount();
    Serial.printf("🔄 Loop Count: %lu ครั้ง | RS232 Bytes: %d bytes\n", loopCount, byteCount);
    loopCount = 0;
  }
  
  // ไม่ต้อง delay เพราะ RS232_loop() อ่านต่อเนื่อง
}

// ===== SETUP LED =====
void setupLED() {
  pinMode(GREEN_LED_PIN, OUTPUT);
  
  // ทดสอบตอนเริ่มต้น: ติดแล้วดับ
  digitalWrite(GREEN_LED_PIN, HIGH);
  delay(500);
  digitalWrite(GREEN_LED_PIN, LOW);
  
  Serial.println("✓ LED initialized");
  Serial.print("  Green LED: GPIO");
  Serial.println(GREEN_LED_PIN);
}

// ===== UPDATE LED =====
void updateLED() {
  if (WiFi.status() != WL_CONNECTED) {
    // ไม่ได้เชื่อมต่อ - ดับ LED
    digitalWrite(GREEN_LED_PIN, LOW);
    return;
  }
  
  // เชื่อมต่อแล้ว - กระพริบทุก 1 วิ ดับ 5 วิ
  unsigned long now = millis();
  unsigned long interval = 6000;  // 1วิ + 5วิ = 6 วินาที
  unsigned long elapsed = now - lastLedBlink;
  
  if (elapsed < 1000) {
    // 1 วินาทีแรก - ติด
    digitalWrite(GREEN_LED_PIN, HIGH);
  } else if (elapsed >= interval) {
    // ครบ 6 วินาทีแล้ว - รีเซ็ต
    lastLedBlink = now;
  } else {
    // ดับอยู่ 5 วินาที
    digitalWrite(GREEN_LED_PIN, LOW);
  }
}

// ===== BLINK LED ONCE =====
void blinkLEDOnce() {
  // กระพริบสั้นๆ 1 ชุด (3 ครั้งเร็ว)
  for (int i = 0; i < 3; i++) {
    digitalWrite(GREEN_LED_PIN, HIGH);
    delay(100);
    digitalWrite(GREEN_LED_PIN, LOW);
    delay(100);
  }
  // รีเซ็ตตัวจับเวลาสำหรับการกระพริบปกติ
  lastLedBlink = millis();
}
