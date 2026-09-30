import { Router } from "express";
import { getMessages, createMessage } from "../controllers/chat.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

/**
 * @openapi
 * /api/chat/{roomId}/messages:
 *   get:
 *     tags:
 *       [Chat]
 *     summary: Get past messages for a Bluetooth chat room
 *     description: Returns the most recent messages for a given roomId (Bluetooth mesh room). Messages are ordered oldest → newest.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Bluetooth room ID (e.g. zigex-cohort-cmui7022b00001q8kvt07u5f6)
 *         example: zigex-cohort-cmui7022b00001q8kvt07u5f6
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of messages to return
 *     responses:
 *       200:
 *         description: List of chat messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ChatMessage'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/:roomId/messages", authMiddleware, getMessages);

/**
 * @openapi
 * /api/chat/{roomId}/messages:
 *   post:
 *     tags:
 *       [Chat]
 *     summary: Send a new message to a Bluetooth chat room
 *     description: Saves a new message to the database. The agent is responsible for also broadcasting it over the BLE mesh.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Bluetooth room ID
 *         example: zigex-cohort-cmui7022b00001q8kvt07u5f6
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: The message text
 *                 example: Hello from the mesh!
 *               type:
 *                 type: string
 *                 enum: [text, code, task_link, announcement]
 *                 default: text
 *                 description: Type of message
 *     responses:
 *       201:
 *         description: Message created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMessage'
 *       400:
 *         description: Bad request (empty content)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post("/:roomId/messages", authMiddleware, createMessage);

export default router;
