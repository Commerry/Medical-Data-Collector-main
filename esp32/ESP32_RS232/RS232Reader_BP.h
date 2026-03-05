/**
 * RS232Reader_BP.h
 * สำหรับเครื่องวัดความดัน (Blood Pressure Monitor)
 * 
 * ⚠️ ใช้เฉพาะ ESP32 เท่านั้น!
 * เหตุผล: ข้อมูล JSON จากเครื่องวัดความดัน > 400 bytes
 *         ต้องใช้ Hardware Serial2 ที่มี buffer ใหญ่
 * 
 * Baud: 115200, Pin: GPIO16(RX), GPIO17(TX)
 * รูปแบบข้อมูล: JSON
 */

#ifndef RS232_READER_BP_H
#define RS232_READER_BP_H

#include <Arduino.h>
#include <ArduinoJson.h>

// ===== ESP32 เท่านั้น =====
#ifdef ESP32
  #define RX_PIN 16  // GPIO16
  #define TX_PIN 17  // GPIO17
#else
  #error "RS232Reader_BP.h รองรับเฉพาะ ESP32! สำหรับ ESP8266 ให้ใช้ RS232Reader_Weight.h"
#endif

// ===== ตัวแปร =====
String jsonBuffer = "";
int rs232ByteCount = 0;
int rs232ValidLineCount = 0;
unsigned long lastDataTime = 0;
bool isCollecting = false;

// ===== Callback =====
void (*onDataReceived)(String jsonData) = nullptr;

// ===== ฟังก์ชันเริ่มต้น =====
void RS232_begin() {
  // ESP32: ใช้ Hardware Serial2 (UART2)
  Serial2.begin(115200, SERIAL_8N1, RX_PIN, TX_PIN);
  Serial.println("📡 RS232 Blood Pressure (ESP32)");
  Serial.printf("   Pin: GPIO%d(RX) / GPIO%d(TX)\n", RX_PIN, TX_PIN);
  Serial.println("   Baud: 115200");
  Serial.println("✅ พร้อมรับข้อมูล JSON (400+ bytes)\n");
  lastDataTime = millis();
}

// ===== ตั้งค่า Callback =====
void RS232_setCallback(void (*callback)(String)) {
  onDataReceived = callback;
}

// ===== Parse และส่งข้อมูล =====
void RS232_processJSON(String json) {
  Serial.println("\n📥 รับข้อมูล JSON:");
  Serial.println("================================================================================");
  Serial.println(json);
  Serial.println("================================================================================");
  Serial.printf("   ขนาด: %d bytes\n\n", json.length());
  
  // Parse JSON
  StaticJsonDocument<2048> doc;
  DeserializationError error = deserializeJson(doc, json);
  
  if (error) {
    Serial.println("⚠️  JSON Parse Error: " + String(error.c_str()));
    return;
  }
  
  Serial.println("✅ Parse JSON สำเร็จ!");
  
  // กรองและส่งเฉพาะข้อมูลที่จำเป็น
  StaticJsonDocument<256> sendDoc;
  bool hasData = false;
  
  // 1. ID Card (เลขบัตรประชาชน)
  if (doc.containsKey("idcard")) {
    String idcard = doc["idcard"].as<String>();
    sendDoc["idcard"] = idcard;
    Serial.printf("   💳 ID Card: %s\n", idcard.c_str());
    hasData = true;
  }
  
  // 2. ความดันบน
  if (doc.containsKey("blood_pressure_h")) {
    int bpH = doc["blood_pressure_h"].as<int>();
    sendDoc["bp"] = bpH;
    Serial.printf("   💉 ความดันบน: %d mmHg\n", bpH);
    hasData = true;
  }
  
  // 3. ความดันล่าง
  if (doc.containsKey("blood_pressure_l")) {
    int bpL = doc["blood_pressure_l"].as<int>();
    sendDoc["bp2"] = bpL;
    Serial.printf("   💉 ความดันล่าง: %d mmHg\n", bpL);
    hasData = true;
  }
  
  // 4. ชีพจร
  if (doc.containsKey("heart_rate")) {
    int hr = doc["heart_rate"].as<int>();
    sendDoc["pulse"] = hr;
    Serial.printf("   💓 ชีพจร: %d bpm\n", hr);
    hasData = true;
  }
  
  // ส่งข้อมูลที่กรองแล้ว (ส่งเฉพาะ 4 fields)
  if (hasData && onDataReceived != nullptr) {
    String jsonStr;
    serializeJson(sendDoc, jsonStr);
    
    Serial.println("\n📤 ส่ง Center (กรองแล้ว):");
    serializeJsonPretty(sendDoc, Serial);
    Serial.println();
    
    onDataReceived(jsonStr);
  }
  
  rs232ValidLineCount++;
}

// ===== ฟังก์ชันอ่านข้อมูล (ESP32 Hardware Serial2) =====
void RS232_loop() {
  // ตรวจสอบว่ามีข้อมูล
  bool hasData = Serial2.available() > 0;
  
  if (hasData) {
    // เริ่มเก็บข้อมูล
    if (!isCollecting) {
      isCollecting = true;
      jsonBuffer = "";
    }
    
    // รอข้อมูลมาครบ (JSON ขนาดใหญ่)
    delay(100);
    
    // อ่านทั้งหมดที่มี (ESP32 Hardware Serial2)
    while (Serial2.available()) {
      char c = Serial2.read();
      jsonBuffer += c;
      rs232ByteCount++;
    }
    
    lastDataTime = millis();
  }
  
  // ถ้าเก็บข้อมูลอยู่ และไม่มีข้อมูลเพิ่มเติมในเวลา 200ms
  if (isCollecting && (millis() - lastDataTime > 200)) {
    // ตรวจสอบว่ามี JSON หรือไม่
    int startIdx = jsonBuffer.indexOf("{");
    int endIdx = jsonBuffer.lastIndexOf("}");
    
    if (startIdx >= 0 && endIdx > startIdx) {
      String json = jsonBuffer.substring(startIdx, endIdx + 1);
      RS232_processJSON(json);
    } else {
      Serial.println("⚠️  ไม่พบ JSON ในข้อมูลที่ได้รับ");
      Serial.println("   ข้อมูล: " + jsonBuffer);
    }
    
    // รีเซ็ต
    jsonBuffer = "";
    isCollecting = false;
  }
}

// ===== ฟังก์ชันสถิติ =====
int RS232_getByteCount() {
  return rs232ByteCount;
}

int RS232_getValidLineCount() {
  return rs232ValidLineCount;
}

int RS232_getValidDataCount() {
  return rs232ValidLineCount;
}

unsigned long RS232_getLastDataTime() {
  return lastDataTime;
}

long RS232_getCurrentBaudRate() {
  return 115200;
}

bool RS232_isBaudRateLocked() {
  return true;
}

#endif
