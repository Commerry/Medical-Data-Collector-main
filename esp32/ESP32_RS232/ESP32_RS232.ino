/**
 * ESP32/ESP8266 RS232 to HTTP POST - Universal Version
 * 
 * อ่านข้อมูล Text/JSON จาก RS232 และส่งไปยัง Center ผ่าน HTTP POST
 * 
 * =============================================================================
 * การเลือกบอร์ด:
 * =============================================================================
 * - ใน Arduino IDE เลือก Board:
 *   • ESP32: "ESP32 Dev Module" หรือ "ESP32-C3 Dev Module"
 *   • ESP8266: "NodeMCU 1.0 (ESP-12E Module)" หรือ "LOLIN(WEMOS) D1 R2 & mini"
 * 
 * - Compiler จะเลือกโค้ดอัตโนมัติตาม Board ที่เลือก
 * 
 * =============================================================================
 * ฮาร์ดแวร์:
 * =============================================================================
 * 
 * ESP32:
 *   - MAX3232 Module: TTL-R1 → GPIO16 (RX), TTL-T1 → GPIO17 (TX)
 *   - Reset Config: BOOT/GPIO0 (กดค้าง 3 วินาที)
 * 
 * ESP8266:
 *   - MAX3232 Module: TTL-R1 → D7 (GPIO13), TTL-T1 → D8 (GPIO15)
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
 * รูปแบบข้อมูล RS232 ที่รองรับ:
 * =============================================================================
 * Text Format:
 *   W:070.3 H:173.5      → น้ำหนัก + ส่วนสูง (จากเครื่องชั่ง)
 *   T365$                → อุณหภูมิ 36.5°C
 *   BP:120/80            → ความดันโลหิต (จากเครื่องวัดความดัน)
 *   P:75 หรือ PULSE:75   → ชีพจร
 * 
 * JSON Format:
 *   {"weight": 70.3, "height": 173.5, "temp": 36.5}
 *   {"bp": 120, "bp2": 80, "pulse": 75}
 * 
 * =============================================================================
 */

// ===== เลือกบอร์ดอัตโนมัติ =====
#ifdef ESP32
  // ========== ESP32 Code ==========
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <Preferences.h>
  Preferences preferences;
  
#elif defined(ESP8266)
  // ========== ESP8266 Code ==========
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClient.h>
  #include <SoftwareSerial.h>
  #include <EEPROM.h>
  #define EEPROM_SIZE 512
#endif

#include "Config.h"
#include "RS232Reader.h"

// ===== Button Pins =====
#ifdef ESP32
  #define BOOT_BTN 0      // GPIO0 (BOOT button)
#elif defined(ESP8266)
  #define BOOT_BTN D2     // GPIO4
#endif

unsigned long lastButtonCheck = 0;
int httpPostCount = 0;

// ===== ฟังก์ชันส่งข้อมูลแต่ละ Field ผ่าน HTTP POST =====
void sendHTTPPost(String deviceType, float value) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi ไม่ได้เชื่อมต่อ - ข้ามการส่งข้อมูล");
    return;
  }
  
  ConfigData* cfg = Config_get();
  
  // สร้าง URL
  String url = String("http://") + CENTER_IP + "/api/vitals";
  
  // สร้าง JSON Payload
  StaticJsonDocument<512> doc;
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
  
  // ส่ง HTTP POST
  HTTPClient http;
  
  #ifdef ESP32
    http.begin(url);
  #elif defined(ESP8266)
    WiFiClient client;
    http.begin(client, url);
  #endif
  
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);  // 5 วินาที
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    httpPostCount++;
    Serial.printf("✅ ส่งข้อมูล #%d สำเร็จ\n", httpPostCount);
    Serial.printf("   Type: %s\n", deviceType.c_str());
    Serial.printf("   Value: %.1f\n", value);
  } else if (httpCode > 0) {
    Serial.printf("❌ HTTP Error: %d\n", httpCode);
    Serial.printf("   URL: %s\n", url.c_str());
    String response = http.getString();
    if (response.length() > 0) {
      Serial.println("   Response: " + response);
    }
  } else {
    Serial.println("❌ การเชื่อมต่อล้มเหลว");
    Serial.printf("   Error: %s\n", http.errorToString(httpCode).c_str());
  }
  
  http.end();
}

// ===== Callback เมื่อได้รับข้อมูล RS232 =====
void onRS232DataReceived(String jsonData) {
  Serial.println("\n📤 กำลังส่งข้อมูลไปยัง Center...");
  
  // Parse JSON
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, jsonData);
  
  if (error) {
    Serial.println("❌ JSON Parse Error: " + String(error.c_str()));
    return;
  }
  
  // ส่งแต่ละ field ที่มีแยกกัน
  if (doc.containsKey("weight")) {
    float weight = doc["weight"].as<float>();
    sendHTTPPost("weight", weight);
    delay(100);
  }
  
  if (doc.containsKey("height")) {
    float height = doc["height"].as<float>();
    sendHTTPPost("height", height);
    delay(100);
  }
  
  if (doc.containsKey("temp")) {
    float temp = doc["temp"].as<float>();
    sendHTTPPost("temp", temp);
    delay(100);
  }
  
  if (doc.containsKey("bp")) {
    float bp = doc["bp"].as<float>();
    sendHTTPPost("bp", bp);
    delay(100);
  }
  
  if (doc.containsKey("bp2")) {
    float bp2 = doc["bp2"].as<float>();
    sendHTTPPost("bp2", bp2);
    delay(100);
  }
  
  if (doc.containsKey("pulse")) {
    int pulse = doc["pulse"].as<int>();
    sendHTTPPost("pulse", (float)pulse);
    delay(100);
  }
  
  Serial.println("✅ ส่งข้อมูลครบทั้งหมดแล้ว\n");
}

// ===== Setup =====
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  #ifdef ESP32
    Serial.println("\n================================================================================");
    Serial.println("  ESP32 RS232 to HTTP POST");
    Serial.println("================================================================================\n");
  #elif defined(ESP8266)
    Serial.println("\n================================================================================");
    Serial.println("  ESP8266 RS232 to HTTP POST");
    Serial.println("================================================================================\n");
  #endif
  
  // ตั้งค่าปุ่ม Reset
  pinMode(BOOT_BTN, INPUT_PULLUP);
  
  #ifdef ESP32
    Serial.println("💡 กดปุ่ม BOOT ค้าง 3 วินาที = Reset Config\n");
  #elif defined(ESP8266)
    Serial.println("💡 กดปุ่ม D2 ค้าง 3 วินาที = Reset Config\n");
  #endif
  
  // โหลด Config
  Config_begin();
  
  // เชื่อมต่อ WiFi (Fixed)
  if (!Config_connectWiFi()) {
    Serial.println("❌ ไม่สามารถเชื่อมต่อ WiFi ได้");
    Serial.println("🔄 กำลัง Restart ใน 5 วินาที...");
    delay(5000);
    ESP.restart();
  }
  
  // ตั้งค่า WiFi Auto-Reconnect
  #ifdef ESP8266
    WiFi.setAutoReconnect(true);
    WiFi.persistent(true);
  #elif defined(ESP32)
    WiFi.setAutoReconnect(true);
  #endif
  
  // เริ่มต้น RS232
  RS232_begin();
  RS232_setCallback(onRS232DataReceived);
  
  Serial.println("\n✅ พร้อมใช้งาน!");
  Serial.println("💡 พิมพ์ 'reset' ใน Serial Monitor เพื่อ Reset Config");
  Serial.println("================================================================================\n");
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
  
  // ตรวจสอบปุ่ม BOOT/D2 กดค้าง 3 วินาที = Reset Config
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
  
  // ตรวจสอบสถานะ WiFi (Auto-reconnect monitoring)
  static unsigned long lastWiFiCheck = 0;
  if (millis() - lastWiFiCheck > 30000) {  // ทุก 30 วินาที
    lastWiFiCheck = millis();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("\n⚠️  WiFi ขาดการเชื่อมต่อ - พยายามเชื่อมต่อใหม่...");
      Config_connectWiFi();
    } else {
      // แสดงสถานะ
      Serial.println("\n📊 สถานะระบบ:");
      Serial.printf("   WiFi: Connected (RSSI: %d dBm)\n", WiFi.RSSI());
      Serial.printf("   Center IP: %s\n", CENTER_IP);
      Serial.printf("   ส่งข้อมูลแล้ว: %d ครั้ง\n", httpPostCount);
      Serial.println();
    }
  }
  
  // อ่านข้อมูล RS232
  RS232_loop();
  
  delay(10);
}
