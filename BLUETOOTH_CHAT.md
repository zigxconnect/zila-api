# Zigex Bluetooth Mesh Chat – Agent Implementation

## Overview

This document explains how to implement the Bluetooth Mesh Chat feature in the **zila-agent**.

The goal is to allow interns and supervisors to chat **without internet** when they are physically close to each other.

- **zila-api** → Provides room information + saves message history
- **zila-agent** → Handles the real Bluetooth communication

---

## Architecture

```
User types message
       ↓
zila-agent
  ├── 1. Save message to API (history)
  └── 2. Broadcast over Bluetooth Mesh
       ↓
Other nearby devices receive it via BLE
```

---

## Required Files

```
src/
├── services/
│   ├── ble-mesh.service.ts     # Bluetooth engine
│   └── cache.service.ts
└── commands/
    └── chat.ts                 # Chat command
```

---

## How It Works (Step by Step)

### 1. User starts chat
```bash
lil-zila chat <cohortId>
```

### 2. Agent gets the room
```http
GET /api/cohorts/:cohortId/chat-group
```

Response contains:
- `chatRoomId` (example: `zigex-cohort-cmui7022b00001q8kvt07u5f6`)
- Supervisor information
- List of members

### 3. Agent starts Bluetooth
```ts
BleMeshService.setRoomContext(chatRoomId);
```

### 4. User sends a message
The agent does two things:

1. **Saves the message** (for history)
   ```http
   POST /api/chat/:roomId/messages
   ```

2. **Broadcasts over Bluetooth**
   ```ts
   await BleMeshService.transmitMessage({ ... })
   ```

### 5. Other devices receive the message
The `BleMeshService` automatically:
- Detects the incoming packet
- Saves it to the database
- Prints it in the terminal

---

## Important Rules

| Rule | Reason |
|------|--------|
| Never start Bluetooth from the API | Servers usually don't have Bluetooth hardware |
| Always get `chatRoomId` from the API first | Room ID format must be correct |
| Always call `setRoomContext()` before sending | The mesh needs to know which room to join |
| Save to API + Broadcast over BLE | You get both history and real-time delivery |
| Use Node <= 20.20.0 | Noble and Bleno have not been updated since node version 20.20.0|
| Install Zadig and use an external bluetooth USB | On windows Bleno can not communicate directly with the bluetooth hardware |
| Install Visual Studio And Python 2.0 + | Needed by windows to allow Noble and bleno compile |
| On Linux give permissions or use `sudo` | Allows direct access to the bluetooth driver |

---

## How to Test Quickly

You can use the standalone test file:

```bash
npx ts-node tests/ble.mesh.test.ts
```

Make sure both devices use the **same room ID**.

---

## Message Flow Summary

1. Get `chatRoomId` from API
2. Start `BleMeshService` with that room
3. When user types a message:
   - Save it via API
   - Call `transmitMessage()`
4. Other devices automatically receive and display it

---

## Next Improvements (Optional)

- Better formatting for incoming messages
- Supervisor announcement command (`/announce`)
- Message signatures for security
- Offline message sync (ring buffer)

---

**Status:** Ready for implementation in zila-agent
