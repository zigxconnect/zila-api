# Zigex Platform: API Testing & Bluetooth Chat Engineering Guide

**FROM:** Gita  
**TO:** Testing & Bluetooth Chat Systems Engineer  
**PROJECT:** Zigex Platform (`zila-api` & `zila-agent`)  
**DATE:** September 2026  
**STATUS:** Complete Specification & Verification Manual  

---

## 1. Executive Summary & Architecture Overview

Welcome to the Zigex Terminal Agent & API stack. This guide provides everything you need to test all API endpoints, interact with the Swagger documentation, and implement the Bluetooth Mesh Peer-to-Peer Chat System for cohorts and supervisors.

### The Polyglot Database Architecture
Our backend combines two database engines:
1. **Supabase (Read-Only Placement Truth)**:
   - Stores historical applications (`Applications`, `internship_applications`), student profiles (`student_profiles`), and supervisor records (`supervisor_profiles`).
   - Acts as the initial source of truth for student acceptances and company tracks (e.g., `Machine Learning/AI`).
2. **Neon PostgreSQL (`neon.db` via Prisma)**:
   - Stores all operational agent data: cohorts, student cohort memberships (`CohortStudent`), tasks, submissions, gamification points, weekly performance reports, and Bluetooth chat metadata.
   - Singleton Prisma client configured in [`src/config/prisma.ts`](file:///home/gita/Desktop/PROJECTS/zigex/zila-api/src/config/prisma.ts).
3. **High-Speed In-Memory Cache (`CacheService`)**:
   - Implemented in [`src/services/cache.service.ts`](file:///home/gita/Desktop/PROJECTS/zigex/zila-api/src/services/cache.service.ts).
   - Caches remote placement queries and cohort listings with a 120-second TTL.
   - Drastically cuts latency from **3,940ms down to 0.8ms (560x speedup)**.

---

## 2. Interactive Swagger UI

The Swagger documentation is live and configured with complete schemas, request parameters, and response structures.

- **Swagger Web UI**: `http://localhost:5000/docs`
- **OpenAPI 3.0 JSON Spec**: `http://localhost:5000/docs.json`

### Key Endpoints Documented in Swagger

| Method | Endpoint | Description | Cache TTL |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/cohorts/group` | Active cohort placement, supervisor admin, & fellow intern peers | 120s |
| `GET` | `/api/cohorts/:cohortId/chat-group` | Complete Bluetooth chat context with supervisor as admin | 120s |
| `GET` | `/api/cohorts/:cohortId/peers` | List fellow interns in a specific cohort | 120s |
| `GET` | `/api/cohorts/my-cohorts` | Enrolled cohorts for authenticated student | 120s |
| `POST`| `/api/cohorts/cache/invalidate`| Clears in-memory cache for latency benchmarking | N/A |
| `GET` | `/api/github/active` | Active course repository for CLI `downloads` | N/A |
| `GET` | `/api/tasks/my-tasks` | Assigned tasks, deadlines, and submissions | N/A |
| `GET` | `/api/gamification/my-stats`| Points, badges, and leaderboard rankings | N/A |

---

## 3. How to Authenticate & Test

### Step 1: Start the API Server
```bash
cd /home/gita/Desktop/PROJECTS/zigex/zila-api
npm start
```
*Console output should confirm: `🚀 Zigex Agent API running on http://localhost:5000` and `📝 Swagger docs available at http://localhost:5000/docs`.*

### Step 2: Generate a Test JWT Token
The API uses Bearer JWT tokens signed with `JWT_SECRET` (`super-secret-zigex-agent-key-2024`).  
To generate a valid token for the test intern (`38212b9c-ce15-42c1-a6be-a1bc97694d63`):

```bash
cd /home/gita/Desktop/PROJECTS/zigex/zila-api
node -e '
const jwt = require("jsonwebtoken");
const token = jwt.sign(
  { id: "38212b9c-ce15-42c1-a6be-a1bc97694d63", email: "student@zigex.com", role: "student" },
  "super-secret-zigex-agent-key-2024",
  { expiresIn: "7d" }
);
console.log("\nYOUR TEST TOKEN:\n" + token + "\n");
'
```

### Step 3: Test via Swagger UI
1. Open your browser to `http://localhost:5000/docs`.
2. Click the green **Authorize** button (top right).
3. Paste the generated token in the `Value` field (no need to type "Bearer ", Swagger adds it automatically).
4. Click **Authorize** and then **Close**.
5. Scroll down to the **Cohorts** section:
   - Expand `GET /api/cohorts/group` -> click **Try it out** -> click **Execute**.
   - Inspect the Response: notice the cohort title, supervisor (`Leonhard Hopeful`), and list of 15 accepted fellow interns.
   - Expand `GET /api/cohorts/{cohortId}/chat-group` -> enter cohort ID `cmui7022b00001q8kvt07u5f6` -> click **Execute**.
   - Inspect the `chatRoomId`: `zigex-cohort-cmui7022b00001q8kvt07u5f6` and supervisor `isAdmin: true`.
   - Click `POST /api/cohorts/cache/invalidate` -> click **Execute** to verify cache purging.

### Step 4: Test via `curl` (Benchmarking Cache)
```bash
TOKEN="<PASTE_TOKEN_HERE>"

# 1. Uncached fetch (Hits Neon & Supabase)
curl -s -w "\nTime: %{time_total}s\n" http://localhost:5000/api/cohorts/group \
  -H "Authorization: Bearer $TOKEN"

# 2. Cached fetch (In-Memory Cache - sub-millisecond)
curl -s -w "\nTime: %{time_total}s\n" http://localhost:5000/api/cohorts/group \
  -H "Authorization: Bearer $TOKEN"
```

### Step 5: Test via `lil-zila` CLI
In a second terminal:
```bash
cd /home/gita/Desktop/PROJECTS/zigex/zila-agent
npm start
```
- In the `lil-zila > ` prompt, type:
  - `group` (Displays formatted monospace table of all 15 interns in 0ms).
  - `group --refresh` (Forces network re-fetch bypassing client cache).
  - `cohorts` (Lists enrolled cohort tracks).
  - `downloads` (Downloads course repo materials).

---

## 4. Bluetooth Chat System Specification

As the engineer building the Bluetooth Chat feature, here is your complete specification and data contracts.

### 4.1 Topology & Network Architecture
- **Protocol**: Bluetooth Low Energy (BLE 5.0+ Preferred).
- **Topology**: Peer-to-Peer Mesh (intern devices connect with each other and the supervisor in proximity without requiring internet/cellular connectivity).
- **Service UUID**: `0000FE26-0000-1000-8000-00805F9B34FB` (Zigex BLE Service).
- **Characteristic UUIDs**:
  - `WRITE / NOTIFY` **Chat Messages**: `0000FE27-0000-1000-8000-00805F9B34FB`
  - `READ` **Group Metadata / Auth**: `0000FE28-0000-1000-8000-00805F9B34FB`
  - `WRITE` **Admin Moderation & Broadcasts**: `0000FE29-0000-1000-8000-00805F9B34FB`

### 4.2 Room Discovery & BLE Advertising
- When an intern or supervisor launches Bluetooth chat, the device advertises with the sanitized room identifier obtained from `GET /api/cohorts/:cohortId/chat-group`:
  ```
  Room ID Format: zigex-cohort-<cleanCohortId>
  Example:        zigex-cohort-cmui7022b00001q8kvt07u5f6
  ```
- **Discovery Packet (Scan Response)**:
  ```json
  {
    "rid": "zigex-cohort-cmui7022b00001q8kvt07u5f6",
    "uid": "38212b9c-ce15-42c1-a6be-a1bc97694d63",
    "adm": false
  }
  ```

### 4.3 Supervisor Authorization (`isAdmin: true`)
From `chatContext.supervisorAdmin`:
- The supervisor device identifies itself with `isAdmin: true` and their unique ID.
- **Supervisor-Only Capabilities**:
  1. **Broadcast Announcements**: System alerts that display pinned at the top of the terminal chat.
  2. **Task Reviews & Approvals**: Direct commands within chat (e.g., `/approve <taskId>`).
  3. **Room Moderation**: Capability to mute disruptive participants or rotate BLE ephemeral encryption keys.
- **Verification Rule**: Intern nodes MUST verify that moderation packets originate from `supervisorAdmin.id` before applying administrative actions.

### 4.4 Message Packet Schema (JSON / MessagePack)
Each message transmitted over the BLE characteristic must adhere to:
```typescript
interface BleChatMessage {
  id: string;             // UUIDv4
  roomId: string;         // e.g. "zigex-cohort-cmui7022b00001q8kvt07u5f6"
  senderId: string;       // auth.users.id
  senderName: string;     // e.g. "Awa MEZOH"
  role: 'student' | 'supervisor';
  isAdmin: boolean;       // true if supervisor
  type: 'text' | 'code' | 'task_link' | 'announcement';
  content: string;        // Max 512 bytes per packet chunk
  timestamp: number;      // Unix epoch ms
  signature?: string;     // HMAC-SHA256 of payload using cohort secret
}
```

### 4.5 Chunking for BLE MTU Limits
- Standard BLE MTU sizes vary between 23 bytes (BLE 4.0 default) to 512 bytes (BLE 5.0 negotiated).
- Implement a 3-byte chunking header if message content exceeds MTU:
  ```
  [PacketIndex (1 byte)][TotalPackets (1 byte)][Payload (...N bytes)]
  ```

### 4.6 Offline Sync & Ring Buffer
1. Maintain an in-memory or SQLite ring buffer of the last 100 messages on each device.
2. When a node reconnects after being out of Bluetooth range:
   - Node sends: `SYNC_REQ: { lastSeenTimestamp: 1727341200000 }`
   - Peers reply with missing messages from their ring buffers.

---

## 5. Summary Checklist for Testing & Implementation

- [x] `zila-api` running on port 5000 with Neon PostgreSQL connected.
- [x] In-memory `CacheService` verified (<1ms cached response time).
- [x] Swagger docs live at `http://localhost:5000/docs`.
- [x] `GET /api/cohorts/group` returning 15 peers + supervisor admin.
- [x] `GET /api/cohorts/:cohortId/chat-group` supplying BLE Room ID and `isAdmin: true`.
- [x] `lil-zila` terminal client rendering the pixel llama with sunglasses and Zigex Blue theme.
- [ ] Bluetooth BLE GATT server & client integration in `zila-agent`.
- [ ] BLE advertising packet matching `zigex-cohort-<cleanId>`.
- [ ] Peer mesh message relay and ring buffer sync tested between 2+ physical devices.

If you encounter any questions or need custom schema adjustments, reach out directly. Happy building!

— **Gita**
