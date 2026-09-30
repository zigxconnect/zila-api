import noble from "@abandonware/noble";
import bleno from "@abandonware/bleno";
import { prisma } from "../config/prisma";
import { CacheService } from "../services/cache.service";
import crypto from "crypto";

export interface BleChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  role: "student" | "supervisor";
  isAdmin: boolean;
  type: "text" | "code" | "task_link" | "announcement";
  content: string;
  timestamp?: number;
  signature?: string;
}

class BleMeshServices {
  private prisma: typeof prisma;
  private cache: CacheService;
  private readonly SERVICE_UUID = "0000fe2600001000800000805f9b34fb";
  private currentRoomId: string | null = null;
  private localSequenceCounter = 0;

  constructor(prismaInstance: typeof prisma, cacheInstance: CacheService) {
    this.prisma = prismaInstance;
    this.cache = cacheInstance;
    this.initializeMeshStack();
  }

  public setRoomContext(roomId: string): void {
    this.currentRoomId = roomId;
  }

  private initializeMeshStack(): void {
    // Listening (Central role)
    noble.on("stateChange", async (state) => {
      if (state === "poweredOn") {
        await noble.startScanningAsync([this.SERVICE_UUID], true);
      } else {
        noble.stopScanning();
      }
    });

    noble.on("discover", async (peripheral) => {
      this.handleIncomingDiscovery(peripheral);
    });

    // Advertising (Peripheral role)
    bleno.on("stateChange", (state) => {
      if (state === "poweredOn" && this.currentRoomId) {
        bleno.startAdvertising(`zigex-${this.currentRoomId.substring(0, 10)}`, [
          this.SERVICE_UUID,
        ]);
      } else {
        bleno.stopAdvertising();
      }
    });
  }

  private async handleIncomingDiscovery(peripheral: any): Promise<void> {
    const advertisement = peripheral.advertisement;
    if (!advertisement || !advertisement.manufacturerData) return;

    const buffer: Buffer = advertisement.manufacturerData;

    // Validate header
    if (buffer.length < 6 || buffer.readUInt16BE(0) !== 0xfe26) return;

    const sequenceId = buffer.readUInt16BE(2);
    const ttl = buffer.readUInt8(4);

    // Deduplication
    const cacheKey = `ble_mesh:\( {this.currentRoomId}: \){sequenceId}`;
    if (await CacheService.get(cacheKey)) return;

    CacheService.set(cacheKey, true, 600); // 10 minutes

    const parsedMessage = this.deserializePayload(buffer.subarray(6));
    if (!parsedMessage || parsedMessage.roomId !== this.currentRoomId) return;

    // Save to database
    // await this.prisma.chatMessage.create({
    //   data: {
    //     id: parsedMessage.id,
    //     roomId: parsedMessage.roomId,
    //     senderId: parsedMessage.senderId,
    //     senderName: parsedMessage.senderName,
    //     role: parsedMessage.role,
    //     isAdmin: parsedMessage.isAdmin,
    //     type: parsedMessage.type,
    //     content: parsedMessage.content,
    //     timestamp: new Date(parsedMessage.timestamp),
    //   },
    // });

    // Relay if TTL still allows
    if (ttl > 1) {
      await this.queueMeshRelay(sequenceId, ttl - 1, buffer.subarray(6));
    }
  }

  public async transmitMessage(
    msgPayload: Omit<BleChatMessage, "signature" | "timestamp">,
  ): Promise<void> {
    this.localSequenceCounter = (this.localSequenceCounter + 1) % 65535;

    const fullMessage: BleChatMessage = {
      ...msgPayload,
      // id: crypto.randomUUID(),
      timestamp: Date.now(),  
    };

    const header = Buffer.alloc(6);
    header.writeUInt16BE(0xfe26, 0); // Magic number
    header.writeUInt16BE(this.localSequenceCounter, 2); // Sequence ID
    header.writeUInt8(5, 4); // Starting TTL = 5

    const payload = this.serializePayload(fullMessage);
    header.writeUInt8(payload.length, 5); // Payload length

    // Mark as seen so we don't process our own message
    await CacheService.set(
      `ble_mesh:\( {this.currentRoomId}: \){this.localSequenceCounter}`,
      true,
      600,
    );

    this.broadcastFrame(Buffer.concat([header, payload]));
  }

  private async queueMeshRelay(
    seqId: number,
    nextTtl: number,
    payload: Buffer,
  ): Promise<void> {
    const relayHeader = Buffer.alloc(6);
    relayHeader.writeUInt16BE(0xfe26, 0);
    relayHeader.writeUInt16BE(seqId, 2);
    relayHeader.writeUInt8(nextTtl, 4);
    relayHeader.writeUInt8(payload.length, 5);

    // Random jitter (0-200ms) to reduce collisions
    setTimeout(
      () => {
        this.broadcastFrame(Buffer.concat([relayHeader, payload]));
      },
      Math.floor(Math.random() * 200),
    );
  }

  private broadcastFrame(frameBuffer: Buffer): void {
    if (bleno.state === "poweredOn") {
      bleno.stopAdvertising(() => {
        bleno.startAdvertisingWithEIRData(frameBuffer);
      });
    }
  }

  private serializePayload(message: BleChatMessage): Buffer {
    return Buffer.from(JSON.stringify(message), "utf-8");
  }

  private deserializePayload(buffer: Buffer): BleChatMessage | null {
    try {
      return JSON.parse(buffer.toString("utf-8")) as BleChatMessage;
    } catch {
      return null;
    }
  }
}

export const BleMeshService = new BleMeshServices(prisma, new CacheService)
