// ===== BOARD DETECTION =====
#ifdef ESP32
  #include <WiFi.h>
  #include <WebServer.h>
  #include <esp_wifi.h>
  #define BOARD_TYPE "ESP32"
  WebServer server(80);
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266WebServer.h>
  #define BOARD_TYPE "ESP8266"
  ESP8266WebServer server(80);
#else
  #error "This board is not supported! Use ESP32 or ESP8266"
#endif

#include <ArduinoJson.h>
#include "Config.h"  // ไฟล์ Configuration แยกต่างหาก

// ===== VARIABLES =====
String macAddress;
unsigned long lastCleanup = 0;

// WiFi Event Handler
#ifdef ESP32
void WiFiAPStationConnected(WiFiEvent_t event, WiFiEventInfo_t info) {
  Serial.println("\n🎉 ========================================");
  Serial.println("   NEW DEVICE CONNECTED TO AP!");
  Serial.println("========================================");
  Serial.print("   MAC Address: ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", info.wifi_ap_staconnected.mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
  Serial.println("========================================\n");
}

void WiFiAPStationDisconnected(WiFiEvent_t event, WiFiEventInfo_t info) {
  Serial.println("\n❌ ========================================");
  Serial.println("   DEVICE DISCONNECTED FROM AP");
  Serial.println("========================================");
  Serial.print("   MAC Address: ");
  for (int i = 0; i < 6; i++) {
    Serial.printf("%02X", info.wifi_ap_stadisconnected.mac[i]);
    if (i < 5) Serial.print(":");
  }
  Serial.println();
  Serial.println("========================================\n");
}
#endif

struct DeviceInfo {
  String deviceId;
  String deviceName;
  String macAddress;
  unsigned long lastSeen;
  bool online;
};

#ifdef ESP32
  std::vector<DeviceInfo> connectedDevices;
#else
  // ESP8266 มี memory น้อยกว่า ใช้ array แทน vector
  DeviceInfo connectedDevices[10];  // รองรับสูงสุด 10 อุปกรณ์
  int deviceCount = 0;
#endif

// ===== FUNCTION DECLARATIONS =====
void setupSoftAP();
void setupWebServer();
void handleVitals();
void handleDeviceStatus();
void handleNotFound();
void updateDevice(String deviceId, String deviceName, String mac);
void cleanupOfflineDevices();
void sendToSerial(String jsonString);
void printDeviceList();

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=============================");
  Serial.print("=== ");
  Serial.print(BOARD_TYPE);
  Serial.println(" Center Starting ===");
  Serial.println("=============================");
  
  // ตั้งค่า WiFi เป็น Access Point
  WiFi.mode(WIFI_AP);
  
  #ifdef ESP32
    // ลงทะเบียน WiFi Event Handlers (ESP32 only)
    WiFi.onEvent(WiFiAPStationConnected, ARDUINO_EVENT_WIFI_AP_STACONNECTED);
    WiFi.onEvent(WiFiAPStationDisconnected, ARDUINO_EVENT_WIFI_AP_STADISCONNECTED);
    Serial.println("✓ WiFi event handlers registered");
  #endif
  
  // เริ่ม Soft AP พร้อม IP ที่กำหนด
  setupSoftAP();
  
  // แสดง MAC Address
  macAddress = WiFi.softAPmacAddress();
  Serial.print("Center MAC Address: ");
  Serial.println(macAddress);
  
  // เริ่มต้น Web Server
  setupWebServer();
  
  Serial.println("\n=== Center Configuration ===");
  Serial.print("Board: ");
  Serial.println(BOARD_TYPE);
  Serial.print("SSID: ");
  Serial.println(CENTER_SSID);
  Serial.print("IP Address: ");
  Serial.println(WiFi.softAPIP());
  Serial.print("MAC: ");
  Serial.println(macAddress);
  Serial.println("============================\n");
  
  Serial.println("Center ready! Waiting for device connections...");
  Serial.println("API Endpoints:");
  Serial.println("  POST /api/vitals - Receive vitals data");
  Serial.println("  POST /api/status - Receive device status");
}

// ===== LOOP =====
void loop() {
  // จัดการ HTTP requests
  server.handleClient();
  
  // แสดงสถานะ AP ทุก 5 วินาที
  static unsigned long lastClientCheck = 0;
  if (millis() - lastClientCheck > 5000) {
    Serial.println("\n========================================");
    Serial.println("📊 AP STATUS CHECK");
    Serial.println("========================================");
    
    // วิธีที่ 1: softAPgetStationNum()
    int clientCount = WiFi.softAPgetStationNum();
    Serial.print("Method 1 - softAPgetStationNum(): ");
    Serial.println(clientCount);
    
    #ifdef ESP32
      // วิธีที่ 2: esp_wifi API (ESP32 only)
      wifi_sta_list_t wifi_sta_list;
      memset(&wifi_sta_list, 0, sizeof(wifi_sta_list));
      
      esp_wifi_ap_get_sta_list(&wifi_sta_list);
      Serial.print("Method 2 - esp_wifi_ap_get_sta_list(): ");
      Serial.print(wifi_sta_list.num);
      Serial.println(" stations");
      
      if (wifi_sta_list.num > 0) {
        Serial.println("\n🔍 Connected Stations:");
        for (int i = 0; i < wifi_sta_list.num; i++) {
          Serial.print("  Station ");
          Serial.print(i + 1);
          Serial.print(": ");
          for (int j = 0; j < 6; j++) {
            Serial.printf("%02X", wifi_sta_list.sta[i].mac[j]);
            if (j < 5) Serial.print(":");
          }
          Serial.println();
        }
      }
    #endif
    
    // แสดงสถานะ AP
    Serial.print("AP SSID: ");
    Serial.println(WiFi.softAPSSID());
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());
    Serial.print("AP Running: ");
    Serial.println(WiFi.getMode() == WIFI_AP || WiFi.getMode() == WIFI_AP_STA ? "YES" : "NO");
    
    if (clientCount > 0) {
      Serial.println("\n✅ Clients detected! Listening for HTTP requests...");
    } else {
      Serial.println("\n⚠️  No clients detected");
      Serial.println("   Troubleshooting:");
      Serial.println("   1. Check Device is powered on");
      Serial.println("   2. Check password matches: Abc123**");
      Serial.println("   3. Check WiFi channel compatibility");
    }
    Serial.println("========================================\n");
    
    lastClientCheck = millis();
  }
  
  // ทำความสะอาดอุปกรณ์ที่ออฟไลน์
  if (millis() - lastCleanup > CLEANUP_INTERVAL) {
    cleanupOfflineDevices();
    lastCleanup = millis();
  }
  
  delay(10);
}

// ===== SETUP SOFT AP =====
void setupSoftAP() {
  Serial.println("\n🔧 === Setting up Soft AP ===");
  
  // ตั้งค่า IP แบบ Static
  Serial.print("Configuring static IP: ");
  Serial.println(local_ip);
  if (!WiFi.softAPConfig(local_ip, gateway, subnet)) {
    Serial.println("❌ Failed to configure AP IP");
  } else {
    Serial.println("✓ IP configured successfully");
  }
  
  // แสดงข้อมูล AP ที่จะสร้าง
  Serial.println("\n📡 AP Configuration:");
  Serial.print("   SSID: ");
  Serial.println(CENTER_SSID);
  Serial.print("   Password: ");
  Serial.println(CENTER_PASSWORD);
  Serial.print("   Password Length: ");
  Serial.println(strlen(CENTER_PASSWORD));
  Serial.print("   Security: ");
  Serial.println(strlen(CENTER_PASSWORD) >= 8 ? "WPA2-PSK" : "OPEN");
  
  // เปิด Soft AP
  Serial.println("\nStarting Soft AP...");
  bool result = WiFi.softAP(CENTER_SSID, CENTER_PASSWORD);
  
  delay(500); // รอให้ AP เริ่มทำงาน
  
  if (result) {
    Serial.println("\n✅ ========================================");
    Serial.println("   SOFT AP STARTED SUCCESSFULLY!");
    Serial.println("========================================");
    Serial.print("   SSID: ");
    Serial.println(CENTER_SSID);
    Serial.print("   Password: ");
    Serial.println(CENTER_PASSWORD);
    Serial.print("   IP: ");
    Serial.println(WiFi.softAPIP());
    Serial.print("   MAC: ");
    Serial.println(WiFi.softAPmacAddress());
    Serial.print("   Channel: ");
    Serial.println(WiFi.channel());
    Serial.println("========================================\n");
  } else {
    Serial.println("\n❌ ========================================");
    Serial.println("   FAILED TO START SOFT AP!");
    Serial.println("========================================");
    Serial.println("   Possible reasons:");
    Serial.println("   - SSID too long (max 32 chars)");
    Serial.println("   - Password too short (min 8 chars for WPA2)");
    Serial.println("   - Hardware issue");
    Serial.println("========================================\n");
  }
}

// ===== SETUP WEB SERVER =====
void setupWebServer() {
  // กำหนด API endpoints
  server.on("/api/vitals", HTTP_POST, handleVitals);
  server.on("/api/status", HTTP_POST, handleDeviceStatus);
  server.onNotFound(handleNotFound);
  
  // เริ่ม server
  server.begin();
  Serial.println("✓ HTTP Server started on port 80");
}

// ===== HANDLE VITALS DATA =====
void handleVitals() {
  if (server.hasArg("plain") == false) {
    server.send(400, "application/json", "{\"error\":\"No data received\"}");
    return;
  }
  
  String body = server.arg("plain");
  
  Serial.println("\n========================================");
  Serial.println("📥 VITALS DATA RECEIVED");
  Serial.println("========================================");
  Serial.print("From IP: ");
  Serial.println(server.client().remoteIP());
  Serial.println("\n--- RAW JSON DATA ---");
  Serial.println(body);
  Serial.println("--- END RAW DATA ---\n");
  
  // Parse JSON
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<256> doc;
  #endif
  
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    Serial.println("========================================\n");
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }
  
  // ดึงข้อมูลอุปกรณ์
  String deviceId = doc["deviceId"].as<String>();
  String deviceName = doc["deviceName"].as<String>();
  String mac = doc["macAddress"].as<String>();
  String deviceType = doc["deviceType"].as<String>();
  String idcard = doc["idcard"].as<String>();
  float value = doc["data"]["value"].as<float>();
  unsigned long timestamp = doc["data"]["timestamp"].as<unsigned long>();
  
  // แสดงข้อมูลแบบละเอียด
  Serial.println("--- PARSED DATA ---");
  Serial.print("  Device ID:   ");
  Serial.println(deviceId);
  Serial.print("  Device Name: ");
  Serial.println(deviceName);
  Serial.print("  MAC Address: ");
  Serial.println(mac);
  Serial.print("  Device Type: ");
  Serial.println(deviceType);
  Serial.print("  ID Card:     ");
  Serial.println(idcard);
  Serial.print("  Value:       ");
  Serial.print(value);
  
  // แสดงหน่วยตามประเภทข้อมูล
  if (deviceType == "bp" || deviceType == "bp2") {
    Serial.println(" mmHg");
  } else if (deviceType == "temp") {
    Serial.println(" °C");
  } else if (deviceType == "pulse") {
    Serial.println(" bpm");
  } else if (deviceType == "spo2") {
    Serial.println(" %");
  } else {
    Serial.println();
  }
  
  Serial.print("  Timestamp:   ");
  Serial.println(timestamp);
  Serial.println("--- END PARSED DATA ---");
  
  // อัพเดทสถานะอุปกรณ์
  updateDevice(deviceId, deviceName, mac);
  
  // ส่งข้อมูลไปยัง Serial (คอมพิวเตอร์จะอ่าน)
  sendToSerial(body);
  
  Serial.println("✅ Data processed successfully");
  Serial.println("========================================\n");
  
  // ส่ง response กลับ
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Data received\"}");
}

// ===== HANDLE DEVICE STATUS =====
void handleDeviceStatus() {
  if (server.hasArg("plain") == false) {
    server.send(400, "application/json", "{\"error\":\"No data received\"}");
    return;
  }
  
  String body = server.arg("plain");
  
  Serial.println("\n========================================");
  Serial.println("📋 DEVICE STATUS RECEIVED");
  Serial.println("========================================");
  Serial.print("From IP: ");
  Serial.println(server.client().remoteIP());
  Serial.println("\n--- RAW JSON DATA ---");
  Serial.println(body);
  Serial.println("--- END RAW DATA ---\n");
  
  // Parse JSON
  #ifdef ESP32
    StaticJsonDocument<512> doc;
  #else
    StaticJsonDocument<256> doc;
  #endif
  
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    Serial.print("❌ JSON parse error: ");
    Serial.println(error.c_str());
    Serial.println("========================================\n");
    server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }
  
  // ดึงข้อมูลอุปกรณ์
  String deviceId = doc["deviceId"].as<String>();
  String deviceName = doc["deviceName"].as<String>();
  String mac = doc["macAddress"].as<String>();
  unsigned long timestamp = doc["timestamp"].as<unsigned long>();
  
  // แสดงข้อมูลแบบละเอียด
  Serial.println("--- PARSED DATA ---");
  Serial.print("  Device ID:   ");
  Serial.println(deviceId);
  Serial.print("  Device Name: ");
  Serial.println(deviceName);
  Serial.print("  MAC Address: ");
  Serial.println(mac);
  Serial.print("  Timestamp:   ");
  Serial.println(timestamp);
  Serial.println("--- END PARSED DATA ---");
  
  // อัพเดทสถานะอุปกรณ์
  updateDevice(deviceId, deviceName, mac);
  
  // ส่งข้อมูลไปยัง Serial (คอมพิวเตอร์จะอ่าน)
  sendToSerial(body);
  
  Serial.println("✅ Status processed successfully");
  Serial.println("========================================\n");
  
  // ส่ง response กลับ
  server.send(200, "application/json", "{\"status\":\"ok\",\"message\":\"Status received\"}");
}

// ===== HANDLE NOT FOUND =====
void handleNotFound() {
  String message = "Not Found\n\n";
  message += "URI: " + server.uri() + "\n";
  message += "Method: " + String((server.method() == HTTP_GET) ? "GET" : "POST") + "\n";
  server.send(404, "text/plain", message);
}

// ===== UPDATE DEVICE =====
void updateDevice(String deviceId, String deviceName, String mac) {
  unsigned long now = millis();
  bool found = false;
  
  #ifdef ESP32
    // ค้นหาและอัพเดทอุปกรณ์ที่มีอยู่
    for (auto &device : connectedDevices) {
      if (device.deviceId == deviceId) {
        device.lastSeen = now;
        device.online = true;
        device.deviceName = deviceName;
        device.macAddress = mac;
        found = true;
        break;
      }
    }
    
    // ถ้าไม่พบ ให้เพิ่มเป็นอุปกรณ์ใหม่
    if (!found) {
      DeviceInfo newDevice;
      newDevice.deviceId = deviceId;
      newDevice.deviceName = deviceName;
      newDevice.macAddress = mac;
      newDevice.lastSeen = now;
      newDevice.online = true;
      
      connectedDevices.push_back(newDevice);
      
      Serial.print("New device connected: ");
      Serial.println(deviceId);
      printDeviceList();
    }
  #else
    // ESP8266 - ใช้ array แทน vector
    for (int i = 0; i < deviceCount; i++) {
      if (connectedDevices[i].deviceId == deviceId) {
        connectedDevices[i].lastSeen = now;
        connectedDevices[i].online = true;
        connectedDevices[i].deviceName = deviceName;
        connectedDevices[i].macAddress = mac;
        found = true;
        break;
      }
    }
    
    // ถ้าไม่พบและยังมีที่ว่าง ให้เพิ่มเป็นอุปกรณ์ใหม่
    if (!found && deviceCount < 10) {
      connectedDevices[deviceCount].deviceId = deviceId;
      connectedDevices[deviceCount].deviceName = deviceName;
      connectedDevices[deviceCount].macAddress = mac;
      connectedDevices[deviceCount].lastSeen = now;
      connectedDevices[deviceCount].online = true;
      deviceCount++;
      
      Serial.print("New device connected: ");
      Serial.println(deviceId);
      printDeviceList();
    }
  #endif
}

// ===== CLEANUP OFFLINE DEVICES =====
void cleanupOfflineDevices() {
  unsigned long now = millis();
  bool changed = false;
  
  #ifdef ESP32
    for (auto &device : connectedDevices) {
      if (device.online && (now - device.lastSeen > DEVICE_TIMEOUT)) {
        device.online = false;
        changed = true;
        Serial.print("Device went offline: ");
        Serial.println(device.deviceId);
      }
    }
  #else
    // ESP8266 - ใช้ array
    for (int i = 0; i < deviceCount; i++) {
      if (connectedDevices[i].online && (now - connectedDevices[i].lastSeen > DEVICE_TIMEOUT)) {
        connectedDevices[i].online = false;
        changed = true;
        Serial.print("Device went offline: ");
        Serial.println(connectedDevices[i].deviceId);
      }
    }
  #endif
  
  if (changed) {
    printDeviceList();
  }
}

// ===== SEND TO SERIAL =====
void sendToSerial(String jsonString) {
  // ส่งข้อมูล JSON ไปยัง Serial เพื่อให้คอมพิวเตอร์อ่าน
  // เพิ่ม prefix [DATA] เพื่อให้แยกจาก debug messages
  Serial.print("[DATA] ");
  Serial.println(jsonString);
}

// ===== PRINT DEVICE LIST =====
void printDeviceList() {
  Serial.println("\n=== Connected Devices ===");
  int onlineCount = 0;
  int totalCount = 0;
  
  #ifdef ESP32
    totalCount = connectedDevices.size();
    for (const auto &device : connectedDevices) {
      Serial.print("  - ");
      Serial.print(device.deviceName);
      Serial.print(" (");
      Serial.print(device.deviceId);
      Serial.print(") ");
      Serial.println(device.online ? "[ONLINE]" : "[OFFLINE]");
      
      if (device.online) onlineCount++;
    }
  #else
    // ESP8266 - ใช้ array
    totalCount = deviceCount;
    for (int i = 0; i < deviceCount; i++) {
      Serial.print("  - ");
      Serial.print(connectedDevices[i].deviceName);
      Serial.print(" (");
      Serial.print(connectedDevices[i].deviceId);
      Serial.print(") ");
      Serial.println(connectedDevices[i].online ? "[ONLINE]" : "[OFFLINE]");
      
      if (connectedDevices[i].online) onlineCount++;
    }
  #endif
  
  Serial.print("Total: ");
  Serial.print(totalCount);
  Serial.print(" devices (");
  Serial.print(onlineCount);
  Serial.println(" online)");
  Serial.println("========================\n");
}
