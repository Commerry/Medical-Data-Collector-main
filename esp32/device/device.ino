// ===== BOARD DETECTION =====
#ifdef ESP32
  #include <WiFi.h>
  #include <HTTPClient.h>
  #define BOARD_TYPE "ESP32"
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266HTTPClient.h>
  #include <WiFiClient.h>
  #define BOARD_TYPE "ESP8266"
#else
  #error "This board is not supported! Use ESP32 or ESP8266"
#endif

#include <ArduinoJson.h>

// ===== LED PIN =====
#ifdef ESP32
  #define GREEN_LED_PIN 2   // GPIO2 - Built-in LED
#elif defined(ESP8266)
  #define GREEN_LED_PIN D4  // D4 (GPIO2 - Built-in LED)
#endif

// ===== CONFIGURATION =====
const char* CENTER_SSID = "MEDICAL_CENTER_01"; // ชื่อ WiFi ของ Center
const char* CENTER_PASSWORD = "Abc123**";      // รหัสผ่าน WiFi
const char* CENTER_IP = "10.1.10.1";           // IP ของ Center

// กำหนดข้อมูลอุปกรณ์ (เปลี่ยนให้แตกต่างกันในแต่ละอุปกรณ์)
const char* DEVICE_ID = "DEVICE_001";      // เปลี่ยนเป็น DEVICE_002, DEVICE_003, ...
const char* DEVICE_NAME = "BP_Monitor_01"; // ชื่ออุปกรณ์

// ===== SIMULATION MODE =====
// จำลอง 2 เครื่อง: เครื่องวัดความดัน และเครื่องชั่งน้ำหนัก
enum MachineMode {
  MODE_BP_MONITOR,   // เครื่องที่ 1: วัดความดัน (ID Card + BP + Pulse)
  MODE_SCALE         // เครื่องที่ 2: ชั่งน้ำหนัก (Weight + Height + Temp)
};

MachineMode currentMode = MODE_BP_MONITOR;  // เริ่มที่เครื่องวัดความดัน
String currentIdCard = "";                   // เก็บ ID Card ปัจจุบัน

// ===== VARIABLES =====
String macAddress;
bool wifiConnected = false;
unsigned long lastStatusSend = 0;
const unsigned long STATUS_INTERVAL = 3000;     // ส่งสถานะทุก 3 วินาที (เรียลไทม์)
unsigned long lastLedBlink = 0;
bool ledBlinkState = false;

// ===== FUNCTION DECLARATIONS =====
void connectWiFi();
bool sendHTTPPost(String endpoint, String jsonData);
void sendDeviceStatus();
void sendVitalsData(const char* idcard, const char* deviceType, float value);
void setupLED();
void updateLED();
void blinkLEDOnce();

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=============================");
  Serial.print("=== ");
  Serial.print(BOARD_TYPE);
  Serial.println(" Device Starting ===");
  Serial.println("=============================");
  
  // ตั้งค่า WiFi mode
  WiFi.mode(WIFI_STA);
  
  // แสดง MAC Address
  macAddress = WiFi.macAddress();
  Serial.print("Device MAC Address: ");
  Serial.println(macAddress);
  Serial.print("Device ID: ");
  Serial.println(DEVICE_ID);
  Serial.print("Device Name: ");
  Serial.println(DEVICE_NAME);
  
  // ตั้งค่า LED
  setupLED();
  
  // เชื่อมต่อ WiFi
  connectWiFi();
  
  // ส่งสถานะแรกทันที
  if (wifiConnected) {
    delay(1000);
    sendDeviceStatus();
  }
  
  Serial.println("\nDevice ready!");
}

// ===== LOOP =====
void loop() {
  // ตรวจสอบการเชื่อมต่อ WiFi
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    Serial.println("\n✗ WiFi disconnected! Reconnecting...");
    connectWiFi();
  } else if (!wifiConnected) {
    wifiConnected = true;
    Serial.println("✓ WiFi reconnected!");
  }
  
  // อัพเดท LED
  updateLED();
  
  // ส่งสถานะอุปกรณ์เป็นระยะ
  if (wifiConnected && (millis() - lastStatusSend > STATUS_INTERVAL)) {
    sendDeviceStatus();
    lastStatusSend = millis();
  }
  
  // ===== จำลองการอ่านค่าจากเซ็นเซอร์ =====
  // จำลอง 2 เครื่อง: เครื่องวัดความดัน และเครื่องชั่งน้ำหนัก
  static unsigned long lastMeasurement = 0;
  if (wifiConnected && (millis() - lastMeasurement > 20000)) { // ส่งข้อมูลทุก 20 วินาที
    
    if (currentMode == MODE_BP_MONITOR) {
      // ===== เครื่องที่ 1: เครื่องวัดความดัน =====
      Serial.println("\n╔════════════════════════════════════════╗");
      Serial.println("║   🩺 เครื่องที่ 1: เครื่องวัดความดัน   ║");
      Serial.println("╚════════════════════════════════════════╝");
      
      // สร้าง ID Card ใหม่
      currentIdCard = "7012345678901";  // ใช้ ID Card ที่มีใน person table (PID=30001)
      Serial.print("📇 ID Card: ");
      Serial.println(currentIdCard);
      Serial.println();
      
      // 1. Blood Pressure (Systolic + Diastolic)
      int bpSystolic = 120 + random(-10, 15);  // 110-135 mmHg
      int bpDiastolic = 80 + random(-5, 10);   // 75-90 mmHg
      
      Serial.print("💉 Measuring Blood Pressure...");
      delay(1000);  // จำลองการวัด
      Serial.println(" Done!");
      Serial.print("   Systolic:  ");
      Serial.print(bpSystolic);
      Serial.println(" mmHg");
      Serial.print("   Diastolic: ");
      Serial.print(bpDiastolic);
      Serial.println(" mmHg");
      
      // 2. Pulse Rate
      int pulse = 75 + random(-15, 15);  // 60-90 bpm
      Serial.print("💓 Measuring Pulse Rate...");
      delay(800);  // จำลองการวัด
      Serial.println(" Done!");
      Serial.print("   Pulse: ");
      Serial.print(pulse);
      Serial.println(" bpm");
      
      // ===== ส่งข้อมูลชุดที่ 1 (BP Monitor) รวมกัน =====
      sendBatchVitalsData(currentIdCard.c_str(), bpSystolic, bpDiastolic, pulse);
      
      Serial.println();
      Serial.println("✅ เครื่องที่ 1 ส่งข้อมูลเรียบร้อย");
      Serial.println("   (กรุณาไปเครื่องที่ 2 ภายใน 2 นาที)");
      Serial.println();
      
      // สลับไปเครื่องที่ 2
      currentMode = MODE_SCALE;
      
    } else {
      // ===== เครื่องที่ 2: เครื่องชั่งน้ำหนัก =====
      Serial.println("\n╔════════════════════════════════════════╗");
      Serial.println("║  ⚖️  เครื่องที่ 2: เครื่องชั่งน้ำหนัก   ║");
      Serial.println("╚════════════════════════════════════════╝");
      Serial.print("📇 Using ID Card: ");
      Serial.println(currentIdCard);
      Serial.println();
      
      // 1. Weight (น้ำหนัก)
      float weight = 60.0 + random(-100, 200) / 10.0;  // 50.0-80.0 kg
      Serial.print("⚖️  Measuring Weight...");
      delay(1000);  // จำลองการวัด
      Serial.println(" Done!");
      Serial.print("   Weight: ");
      Serial.print(weight);
      Serial.println(" kg");
      
      // 2. Height (ส่วนสูง)
      float height = 165.0 + random(-150, 150) / 10.0;  // 150.0-180.0 cm
      Serial.print("📏 Measuring Height...");
      delay(800);  // จำลองการวัด
      Serial.println(" Done!");
      Serial.print("   Height: ");
      Serial.print(height);
      Serial.println(" cm");
      
      // 3. Temperature (อุณหภูมิร่างกาย)
      float temperature = 36.5 + random(-5, 10) / 10.0;  // 36.0-37.5 °C
      Serial.print("🌡️  Measuring Temperature...");
      delay(800);  // จำลองการวัด
      Serial.println(" Done!");
      Serial.print("   Temperature: ");
      Serial.print(temperature);
      Serial.println(" °C");
      
      // ===== ส่งข้อมูลชุดที่ 2 (Scale) รวมกัน (ไม่ส่ง ID Card) =====
      sendScaleVitalsData(weight, height, temperature);
      
      Serial.println();
      Serial.println("✅ เครื่องที่ 2 ส่งข้อมูลเรียบร้อย");
      Serial.println("   (ข้อมูลครบถ้วน พร้อมบันทึก Database)");
      Serial.println();
      
      // กลับไปเครื่องที่ 1 สำหรับคนต่อไป
      currentMode = MODE_BP_MONITOR;
      currentIdCard = "";  // ล้าง ID Card
    }
    
    lastMeasurement = millis();
  }
  
  delay(100);
}

// ===== CONNECT TO WIFI =====
void connectWiFi() {
  Serial.println("\n========================================");
  Serial.println("=== Connecting to WiFi ===");
  Serial.println("========================================");
  Serial.print("Target SSID: ");
  Serial.println(CENTER_SSID);
  Serial.print("Password: ");
  Serial.println(CENTER_PASSWORD);  // แสดงรหัสจริงเพื่อ debug
  Serial.print("Expected Gateway: ");
  Serial.println(CENTER_IP);
  
  // ลบ WiFi ที่จำไว้ทั้งหมด และตัดการเชื่อมต่อเก่า
  WiFi.disconnect(true);  // true = ลบ credentials ที่จำไว้
  delay(500);
  
  WiFi.begin(CENTER_SSID, CENTER_PASSWORD);
  Serial.println("\nConnecting");
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    
    // แสดงสถานะการเชื่อมต่อ
    if (attempts % 10 == 9) {
      Serial.println();
      Serial.print("  Status code: ");
      Serial.print(WiFi.status());
      Serial.print(" (");
      switch(WiFi.status()) {
        case WL_IDLE_STATUS: Serial.print("IDLE"); break;
        case WL_NO_SSID_AVAIL: Serial.print("NO_SSID_AVAILABLE"); break;
        case WL_SCAN_COMPLETED: Serial.print("SCAN_COMPLETED"); break;
        case WL_CONNECTED: Serial.print("CONNECTED"); break;
        case WL_CONNECT_FAILED: Serial.print("CONNECT_FAILED"); break;
        case WL_CONNECTION_LOST: Serial.print("CONNECTION_LOST"); break;
        case WL_DISCONNECTED: Serial.print("DISCONNECTED"); break;
        default: Serial.print("UNKNOWN"); break;
      }
      Serial.println(")");
    }
    
    attempts++;
  }
  
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n✅ WiFi Connected Successfully!");
    Serial.println("--- Connection Details ---");
    Serial.print("  Connected SSID: ");
    Serial.println(WiFi.SSID());
    Serial.print("  IP Address:     ");
    Serial.println(WiFi.localIP());
    Serial.print("  Gateway:        ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("  Subnet:         ");
    Serial.println(WiFi.subnetMask());
    Serial.print("  MAC:            ");
    Serial.println(WiFi.macAddress());
    Serial.print("  AP BSSID:       ");
    Serial.println(WiFi.BSSIDstr());  // MAC address ของ AP ที่เชื่อมต่อ
    Serial.print("  Signal:         ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    Serial.print("  Target Center:  ");
    Serial.println(CENTER_IP);
    Serial.println("-------------------------");
    
    // ⚠️ ตรวจสอบว่าเชื่อมต่อถูก AP หรือไม่
    String connectedSSID = WiFi.SSID();
    String gatewayIP = WiFi.gatewayIP().toString();
    
    Serial.println("\n🔍 === VERIFICATION ===");
    Serial.print("  SSID Match: ");
    if (connectedSSID == CENTER_SSID) {
      Serial.println("✅ CORRECT");
    } else {
      Serial.println("❌ WRONG! Connected to: " + connectedSSID);
      Serial.println("     Expected: " + String(CENTER_SSID));
    }
    
    Serial.print("  Gateway Match: ");
    if (gatewayIP == CENTER_IP) {
      Serial.println("✅ CORRECT (10.1.10.1)");
    } else {
      Serial.println("❌ WRONG! Gateway is: " + gatewayIP);
      Serial.println("     Expected: " + String(CENTER_IP));
      Serial.println("     ⚠️⚠️⚠️ CONNECTED TO WRONG NETWORK! ⚠️⚠️⚠️");
    }
    Serial.println("========================");
    
    Serial.println("========================================\n");
  } else {
    wifiConnected = false;
    Serial.println("\n❌ WiFi Connection Failed!");
    Serial.print("  Final status: ");
    Serial.println(WiFi.status());
    Serial.println("  Possible reasons:");
    Serial.println("  - SSID not found (check Center is running)");
    Serial.println("  - Wrong password");
    Serial.println("  - Signal too weak");
    Serial.println("  - AP not accepting connections");
    Serial.println("\n  Will retry in 10 seconds...");
    Serial.println("========================================\n");
  }
}

// ===== SEND HTTP POST =====
bool sendHTTPPost(String endpoint, String jsonData) {
  if (!wifiConnected) {
    Serial.println("❌ WiFi not connected! Cannot send HTTP request.");
    return false;
  }
  
  Serial.println("\n--- HTTP POST REQUEST ---");
  Serial.print("  Endpoint: ");
  Serial.println(endpoint);
  Serial.print("  URL: http://");
  Serial.print(CENTER_IP);
  Serial.println(endpoint);
  Serial.print("  Data size: ");
  Serial.print(jsonData.length());
  Serial.println(" bytes");
  
  #ifdef ESP32
    HTTPClient http;
    String url = "http://" + String(CENTER_IP) + endpoint;
    
    Serial.println("  Starting HTTP connection...");
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000); // 5 second timeout
    
    Serial.println("  Sending POST request...");
    int httpResponseCode = http.POST(jsonData);
    
    Serial.print("  HTTP Response Code: ");
    Serial.println(httpResponseCode);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("  Response: ");
      Serial.println(response);
      http.end();
      Serial.println("✅ HTTP Request Successful");
      Serial.println("--- END HTTP REQUEST ---\n");
      
      // กระพริบ LED เมื่อส่งข้อมูลสำเร็จ
      blinkLEDOnce();
      
      return true;
    } else {
      Serial.print("❌ HTTP Error: ");
      Serial.println(http.errorToString(httpResponseCode));
      Serial.println("  Possible reasons:");
      Serial.println("  - Center not responding");
      Serial.println("  - Network connection lost");
      Serial.println("  - Timeout (>5 seconds)");
      http.end();
      Serial.println("--- END HTTP REQUEST ---\n");
      return false;
    }
  #else
    // ESP8266
    WiFiClient client;
    HTTPClient http;
    String url = "http://" + String(CENTER_IP) + endpoint;
    
    Serial.println("  Starting HTTP connection...");
    http.begin(client, url);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000); // 5 second timeout
    
    Serial.println("  Sending POST request...");
    int httpResponseCode = http.POST(jsonData);
    
    Serial.print("  HTTP Response Code: ");
    Serial.println(httpResponseCode);
    
    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("  Response: ");
      Serial.println(response);
      http.end();
      Serial.println("✅ HTTP Request Successful");
      Serial.println("--- END HTTP REQUEST ---\n");
      
      // กระพริบ LED เมื่อส่งข้อมูลสำเร็จ
      blinkLEDOnce();
      
      return true;
    } else {
      Serial.print("❌ HTTP Error code: ");
      Serial.println(httpResponseCode);
      Serial.println("  Possible reasons:");
      Serial.println("  - Center not responding");
      Serial.println("  - Network connection lost");
      Serial.println("  - Timeout (>5 seconds)");
      http.end();
      Serial.println("--- END HTTP REQUEST ---\n");
      return false;
    }
  #endif
}

// ===== SEND DEVICE STATUS =====
void sendDeviceStatus() {
  if (!wifiConnected) return;
  
  #ifdef ESP32
    StaticJsonDocument<256> doc;
  #else
    StaticJsonDocument<200> doc;
  #endif
  
  doc["type"] = "device_status";
  doc["deviceId"] = DEVICE_ID;
  doc["deviceName"] = DEVICE_NAME;
  doc["macAddress"] = macAddress;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("\n--- Sending Device Status ---");
  if (sendHTTPPost("/api/status", jsonString)) {
    Serial.println("✓ Status sent successfully");
  } else {
    Serial.println("✗ Failed to send status");
  }
}

// ===== SEND VITALS DATA =====
void sendVitalsData(const char* idcard, const char* deviceType, float value) {
  if (!wifiConnected) return;
  
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<256> doc;
  #endif
  
  doc["type"] = "vitals";
  doc["deviceId"] = DEVICE_ID;
  doc["deviceName"] = DEVICE_NAME;
  doc["macAddress"] = macAddress;
  doc["deviceType"] = deviceType;
  doc["idcard"] = idcard;
  
  JsonObject data = doc.createNestedObject("data");
  data["value"] = value;
  data["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  if (sendHTTPPost("/api/vitals", jsonString)) {
    // Success message already printed by sendHTTPPost
  } else {
    Serial.println("✗ Failed to send vitals data");
  }
}

// ===== SEND BATCH VITALS DATA (BP Monitor) =====
// ส่งข้อมูลชุดที่ 1: ID Card + BP + Pulse รวมกัน
void sendBatchVitalsData(const char* idcard, int bpSystolic, int bpDiastolic, int pulse) {
  if (!wifiConnected) return;
  
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<256> doc;
  #endif
  
  doc["type"] = "vitals";
  doc["deviceId"] = DEVICE_ID;
  doc["deviceName"] = DEVICE_NAME;
  doc["macAddress"] = macAddress;
  doc["deviceType"] = "combined";  // รวมหลาย field
  doc["idcard"] = idcard;  // มี ID Card
  
  // สร้าง nested object สำหรับ vital signs
  doc["bp"] = bpSystolic;
  doc["bp2"] = bpDiastolic;
  doc["pulse"] = pulse;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("\n--- Sending BP Monitor Batch ---");
  Serial.println(jsonString);
  
  if (sendHTTPPost("/api/vitals", jsonString)) {
    Serial.println("✅ BP Monitor batch sent successfully");
  } else {
    Serial.println("✗ Failed to send BP Monitor batch");
  }
}

// ===== SEND SCALE VITALS DATA (Scale) =====
// ส่งข้อมูลชุดที่ 2: Weight + Height + Temp รวมกัน (ไม่ส่ง ID Card)
void sendScaleVitalsData(float weight, float height, float temperature) {
  if (!wifiConnected) return;
  
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<256> doc;
  #endif
  
  doc["type"] = "vitals";
  doc["deviceId"] = DEVICE_ID;
  doc["deviceName"] = DEVICE_NAME;
  doc["macAddress"] = macAddress;
  doc["deviceType"] = "combined";  // รวมหลาย field
  // ไม่ส่ง idcard - จะใช้ session เดิม
  
  // สร้าง nested object สำหรับ vital signs
  doc["weight"] = weight;
  doc["height"] = height;
  doc["temp"] = temperature;
  doc["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("\n--- Sending Scale Batch ---");
  Serial.println(jsonString);
  
  if (sendHTTPPost("/api/vitals", jsonString)) {
    Serial.println("✅ Scale batch sent successfully");
  } else {
    Serial.println("✗ Failed to send Scale batch");
  }
}

// ===== SETUP LED =====
void setupLED() {
  pinMode(GREEN_LED_PIN, OUTPUT);
  
  // ทดสอบตอนเริ่มต้น: ติดแล้วดับ
  digitalWrite(GREEN_LED_PIN, HIGH);
  delay(500);
  digitalWrite(GREEN_LED_PIN, LOW);
  
  Serial.println("✓ LED initialized");
  #ifdef ESP32
    Serial.printf("  Green LED: GPIO%d\n", GREEN_LED_PIN);
  #else
    Serial.print("  Green LED: GPIO");
    Serial.println(GREEN_LED_PIN);
  #endif
}

// ===== UPDATE LED =====
void updateLED() {
  if (!wifiConnected) {
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
