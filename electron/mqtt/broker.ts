import Aedes, { type Client } from "aedes";
import net from "net";
import { parseTopic } from "./topics";

export type MqttClientInfo = {
  clientId: string;
  ip: string | null;
};

export type BrokerOptions = {
  port: number;
  username: string;
  password: string;
  onMessage?: (payload: { topic: string; deviceType: string; message: string }) => void;
  onClientsUpdated?: (clients: MqttClientInfo[]) => void;
};

export const startBroker = ({ port, username, password, onMessage, onClientsUpdated }: BrokerOptions) => {
  const broker = new Aedes();
  const clients = new Map<string, MqttClientInfo>();

  const emitClientsUpdated = () => {
    onClientsUpdated?.(Array.from(clients.values()));
  };

  const trackClient = (client: Client) => {
    if (!client?.id) {
      return;
    }
    const connection = client.conn as net.Socket | undefined;
    const ip = connection?.remoteAddress ?? null;
    clients.set(client.id, { clientId: client.id, ip });
    emitClientsUpdated();
  };

  const removeClient = (client: Client) => {
    if (!client?.id) {
      return;
    }
    const removed = clients.delete(client.id);
    if (removed) {
      emitClientsUpdated();
    }
  };

  broker.authenticate = (client, providedUser, providedPassword, callback) => {
    const user = (providedUser ?? "").toString();
    const pass = (providedPassword ?? "").toString();
    const ok = user === username && pass === password;
    if (ok) {
      callback(null, true);
    } else {
      const error = Object.assign(new Error("Invalid MQTT credentials"), {
        returnCode: 4
      });
      callback(error, false);
    }
  };

  broker.on("publish", (packet, client) => {
    if (!client) {
      return;
    }

    const topicInfo = parseTopic(packet.topic);
    if (!topicInfo) {
      return;
    }

    const message = packet.payload?.toString() ?? "";
    
    // Handle new unified vitals topic
    if ("topicType" in topicInfo && topicInfo.topicType === "vitals") {
      onMessage?.({
        topic: packet.topic,
        deviceType: "vitals",
        message
      });
      return;
    }
    
    // Handle legacy per-device topics
    if ("deviceType" in topicInfo) {
      onMessage?.({
        topic: packet.topic,
        deviceType: topicInfo.deviceType,
        message
      });
    }
  });

  broker.on("clientReady", (client) => {
    trackClient(client);
  });

  broker.on("clientDisconnect", (client) => {
    removeClient(client);
  });

  broker.on("clientError", (client) => {
    if (client) {
      removeClient(client);
    }
  });

  const server = net.createServer(broker.handle);
  server.listen(port);

  return {
    broker,
    server,
    getClients: () => Array.from(clients.values())
  };
};
