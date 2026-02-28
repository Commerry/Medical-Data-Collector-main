// Legacy device types (for backward compatibility)
export const DEVICE_TYPES = ["cardreader", "weight", "height", "bp", "temp", "pulse"] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

// Topic constants
export const CARDREADER_TOPIC = "cardreader";
export const VITALS_TOPIC = "vitals";

/**
 * Legacy method - builds individual device topic
 * @deprecated Use buildVitalsTopic() for new implementations
 */
export const buildTopic = (pcucode: string, deviceType: DeviceType) => {
  return `clinic/${pcucode}/device/${deviceType}/data`;
};

/**
 * Builds the unified vitals topic where all measurements are sent
 * @returns clinic/vitals/data
 */
export const buildVitalsTopic = () => {
  return `clinic/${VITALS_TOPIC}/data`;
};

/**
 * Parses MQTT topic to determine type and parameters
 * Supports both legacy format and new combined vitals format
 */
export const parseTopic = (topic: string) => {
  const parts = topic.split("/");

  // New unified vitals topic: clinic/vitals/data
  if (parts.length === 3 && parts[0] === "clinic" && parts[1] === "vitals" && parts[2] === "data") {
    return { topicType: "vitals", currentFormat: true };
  }

  // Legacy per-device topic: clinic/{pcucode}/device/{deviceType}/data
  if (parts.length === 5) {
    const [prefix, pcucode, deviceLabel, deviceType, suffix] = parts;
    if (prefix !== "clinic" || deviceLabel !== "device" || suffix !== "data") {
      return null;
    }

    if (!DEVICE_TYPES.includes(deviceType as DeviceType)) {
      return null;
    }

    return { pcucode, deviceType: deviceType as DeviceType, currentFormat: false };
  }

  return null;
};
