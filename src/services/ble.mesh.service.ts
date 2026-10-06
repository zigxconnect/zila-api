import noble from "@stoprocent/noble";
import bleno from "@stoprocent/bleno";
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
  signature: string;
}

class BleMeshServices {
  private prisma: typeof prisma;
  private cache: CacheService;
  private readonly SERVICE_UUID = "0000fe2600001000800000805f9b34fb";
  private readonly MANUFACTURER_ID = 0xfe26;
  private currentRoomId: string | null = null;
  private localSequenceCounter = 0;
  private isSwitching = false;

  constructor(prismaInstance: typeof prisma, cacheInstance: CacheService) {
    this.prisma = prismaInstance;
    this.cache = cacheInstance;
    this.initializeMeshStack();
  }

  public setRoomContext(roomId: string): void {
    this.currentRoomId = roomId;
    // Restart advertising with new room name
    if (bleno.state === "poweredOn") {
      this.startAdvertising();
    }
  }

  private initializeMeshStack(): void {
    noble.on("stateChange", async (state: any) => {
      if (state === "poweredOn") {
        await noble.startScanningAsync([this.SERVICE_UUID], true);
      }
    });

    noble.on("discover", async (peripheral: any) => {
      this.handleIncomingDiscovery(peripheral);
    });

    bleno.on("stateChange", (state: any) => {
      if (state === "poweredOn" && this.currentRoomId) {
        this.startAdvertising();
      }
    });
  }

  private startAdvertising() {
    if (!this.currentRoomId) return;
    bleno.startAdvertising(`zigex-${this.currentRoomId.substring(0, 10)}`, [
      this.SERVICE_UUID,
    ]);
  }

  private async handleIncomingDiscovery(peripheral: any): Promise<void> {
    const adv = peripheral.advertisement;
    if (!adv?.manufacturerData) return;
    const buffer: Buffer = adv.manufacturerData;

    if (buffer.length < 6 || buffer.readUInt16BE(0) !== this.MANUFACTURER_ID)
      return;

    const sequenceId = buffer.readUInt16BE(2);
    const ttl = buffer.readUInt8(4);

    // FIXED: interpolation
    const cacheKey = `ble_mesh:${this.currentRoomId}:${sequenceId}`;
    if (await CacheService.get(cacheKey)) return;
    CacheService.set(cacheKey, true, 600);

    const parsedMessage = this.deserializePayload(buffer.subarray(6));
    if (!parsedMessage || parsedMessage.roomId !== this.currentRoomId) return;

    await this.prisma.chatMessage.create({
      data: {
        id: parsedMessage.id,
        roomId: parsedMessage.roomId,
        senderId: parsedMessage.senderId,
        senderName: parsedMessage.senderName,
        role: parsedMessage.role,
        isAdmin: parsedMessage.isAdmin,
        type: parsedMessage.type,
        content: parsedMessage.content,
        timestamp: new Date(parsedMessage.timestamp ?? Date.now()),
      },
    });

    if (ttl > 1) {
      await this.queueMeshRelay(sequenceId, ttl - 1, buffer.subarray(6));
    }
  }

  public async transmitMessage(
    msgPayload: Omit<BleChatMessage, "id" | "timestamp">,
  ): Promise<void> {
    this.localSequenceCounter = (this.localSequenceCounter + 1) % 65535;

    const fullMessage: BleChatMessage = {
      ...msgPayload,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      signature: "todo-sign", // you left this out
    } as BleChatMessage;

    const header = Buffer.alloc(6);
    header.writeUInt16BE(this.MANUFACTURER_ID, 0);
    header.writeUInt16BE(this.localSequenceCounter, 2);
    header.writeUInt8(5, 4);
    const payload = this.serializePayload(fullMessage);
    header.writeUInt8(payload.length, 5);

    CacheService.set(
      `ble_mesh:${this.currentRoomId}:${this.localSequenceCounter}`,
      true,
      600,
    );

    this.broadcastFrame(Buffer.concat([header, payload]));
  }

  private async queueMeshRelay(
    seqId: number,
    nextTtl: number,
    payload: Buffer,
  ) {
    const relayHeader = Buffer.alloc(6);
    relayHeader.writeUInt16BE(this.MANUFACTURER_ID, 0);
    relayHeader.writeUInt16BE(seqId, 2);
    relayHeader.writeUInt8(nextTtl, 4);
    relayHeader.writeUInt8(payload.length, 5);

    setTimeout(() => {
      this.broadcastFrame(Buffer.concat([relayHeader, payload]));
    }, Math.random() * 200);
  }

  private broadcastFrame(frameBuffer: Buffer): void {
    if (this.isSwitching) return;
    this.isSwitching = true;

    // FIX: must stop scanning before advertising on same adapter
    noble.stopScanningAsync().then(() => {
      bleno.stopAdvertising(() => {
        // FIX: correct EIR data format
        const advData = Buffer.concat([
          Buffer.from([0x02, 0x01, 0x06]), // Flags
          Buffer.from([0x03, 0x03, 0x0a, 0x18]), // Service UUID placeholder
        ]);
        // Put your mesh frame in scan response as manufacturer data
        const scanData = frameBuffer;

        // @stoprocent/bleno supports raw buffers like this:
        (bleno as any).startAdvertisingWithEIRData(
          advData,
          scanData,
          (err: any) => {
            this.isSwitching = false;
            // Resume scanning after 500ms broadcast window
            setTimeout(() => {
              bleno.stopAdvertising(() => {
                noble.startScanningAsync([this.SERVICE_UUID], true);
              });
            }, 500);
          },
        );
      });
    });
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

export const BleMeshService = new BleMeshServices(prisma, new CacheService());
