import noble from '@abandonware/noble';
import bleno from '@abandonware/bleno';
import { PrismaClient } from '../generated/prisma';
import { CacheService } from '../services/ble.mesh.service';
export interface BleChatMessage {
  id: string; roomId: string; senderId: string; senderName: string;
  role: 'student' | 'supervisor'; isAdmin: boolean;
  type: 'text' | 'code' | 'task_link' | 'announcement';
  content: string; timestamp: number; signature?: string;
}
export class BleMeshProcessor {
  private prisma: PrismaClient; 
  private cache: CacheService;
  private readonly SERVICE_UUID = '0000fe2600001000800000805f9b34fb';
  private currentRoomId: string | null = null;
  private localSequenceCounter = 0;
  constructor(prismaInstance: PrismaClient, cacheInstance: CacheService) {
    this.prisma = prismaInstance; 
    this.cache = cacheInstance;
    this.initializeMeshStack();
  }
  public setRoomContext(roomId: string): void { this.currentRoomId = roomId; }
  private initializeMeshStack(): void {
    noble.on('stateChange', async (state) => {
      if (state === 'poweredOn') { await noble.startScanningAsync([this.SERVICE_UUID], true); }
      else { noble.stopScanning(); }
    });
    noble.on('discover', async (peripheral) => { this.handleIncomingDiscovery(peripheral); });
    bleno.on('stateChange', (state) => {
      if (state === 'poweredOn' && this.currentRoomId) {
        bleno.startAdvertising(`zigex-${this.currentRoomId.substring(0, 10)}`, [this.SERVICE_UUID]);
      } else { bleno.stopAdvertising(); }
    });
  }
  private async handleIncomingDiscovery(peripheral: any): Promise<void> {
    const advertisement = peripheral.advertisement;
    if (!advertisement || !advertisement.manufacturerData) return;
    const buffer: Buffer = advertisement.manufacturerData;
    if (buffer.length < 6 || buffer.readUInt16BE(0) !== 0xFE26) return;
    const sequenceId = buffer.readUInt16BE(2);
    const ttl = buffer.readUInt8(4);
    const cacheKey = `ble_mesh:${this.currentRoomId}:${sequenceId}`;
    if (await this.cache.get(cacheKey)) return; // Deduplication Hit
  await this.cache.set(cacheKey, true, 600); // Lock token in cache (10 mins)
    const parsedMessage = this.deserializePayload(buffer.subarray(6));
    if (!parsedMessage || parsedMessage.roomId !== this.currentRoomId) return;
    await this.prisma.chatMessage.create({
      data: {
        id: parsedMessage.id, roomId: parsedMessage.roomId,
        senderId: parsedMessage.senderId, senderName: parsedMessage.senderName,
        role: parsedMessage.role, isAdmin: parsedMessage.isAdmin,
        type: parsedMessage.type, content: parsedMessage.content,
        timestamp: new Date(parsedMessage.timestamp),
      }
    });
    if (ttl > 1) { await this.queueMeshRelay(sequenceId, ttl - 1, buffer.subarray(6)); }
  }
  public async transmitMessage(msgPayload: Omit<BleChatMessage, "id" | "timestamp">): Promise<void> {
    this.localSequenceCounter = (this.localSequenceCounter + 1) % 65535;
    const fullMessage: BleChatMessage = { ...msgPayload, id: crypto.randomUUID(), timestamp: Date.now() };
    const header = Buffer.alloc(6);
    header.writeUInt16BE(0xFE26, 0);
    header.writeUInt16BE(this.localSequenceCounter, 2);
    header.writeUInt8(5, 4); // Starting TTL
    const payload = this.serializePayload(fullMessage);
    header.writeUInt8(payload.length, 5);
    await this.cache.set(`ble_mesh:${this.currentRoomId}:${this.localSequenceCounter}`, true, 600);
    this.broadcastFrame(Buffer.concat([header, payload]));
  }
  private async queueMeshRelay(seqId: number, nextTtl: number, payload: Buffer): Promise<void> {
    const relayHeader = Buffer.alloc(6);
    relayHeader.writeUInt16BE(0xFE26, 0); relayHeader.writeUInt16BE(seqId, 2);
    relayHeader.writeUInt8(nextTtl, 4); relayHeader.writeUInt8(payload.length, 5);
    
    setTimeout(() => {
      this.broadcastFrame(Buffer.concat([relayHeader, payload]));
    }, Math.floor(Math.random() * 200)); // 0-200ms Jitter Window
  }
  private broadcastFrame(frameBuffer: Buffer): void {
    if (bleno.state === 'poweredOn') {
      bleno.stopAdvertising(() => { bleno.startAdvertisingWithEIRData(frameBuffer); });
    }
  }
  private serializePayload(message: BleChatMessage): Buffer { 
    return Buffer.from(JSON.stringify(message), 'utf-8'); }
  private deserializePayload(buffer: Buffer): BleChatMessage | null {
    try { return JSON.parse(buffer.toString('utf-8')) as BleChatMessage; } catch { return null; }
  }
}