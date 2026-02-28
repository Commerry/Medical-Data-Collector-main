/**
 * Config.h - Center Configuration
 * 
 * ไฟล์สำหรับตั้งค่า WiFi Access Point และ Network Configuration
 * แก้ไขที่นี่เมื่อต้องการเปลี่ยนการตั้งค่า
 */

#ifndef CENTER_CONFIG_H
#define CENTER_CONFIG_H

// ===== CONFIGURATION =====

// WiFi Access Point Settings
const char* CENTER_SSID = "MEDICAL_CENTER_01";  // SSID สำหรับ Soft AP
const char* CENTER_PASSWORD = "Abc123**";       // รหัสผ่าน WiFi (ต้องมีอย่างน้อย 8 ตัวอักษร)
const char* CENTER_NAME = "MEDICAL_CENTER_01";  // ชื่ออุปกรณ์

// Network Configuration
IPAddress local_ip(10, 1, 10, 1);      // Center IP Address (Fixed)
IPAddress gateway(10, 1, 10, 1);       // Gateway Address
IPAddress subnet(255, 255, 255, 0);    // Subnet Mask

// Timing Settings (ปรับให้อัพเดตเรียลไทม์เร็วขึ้น)
const unsigned long CLEANUP_INTERVAL = 10000;  // ตรวจสอบอุปกรณ์ออฟไลน์ทุก 10 วินาที (เร็วขึ้น)
const unsigned long DEVICE_TIMEOUT = 10000;    // ถือว่าอุปกรณ์ออฟไลน์หากไม่ได้รับข้อมูลเกิน 10 วินาที (ตอบสนองเร็วขึ้น)

#endif
