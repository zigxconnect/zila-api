import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { BleMeshService, BleChatMessage } from "../services/ble.mesh.service";

/**
 * GET /api/chat/:roomId/messages
 * Retrieve past messages for a Bluetooth room
 */
export const getMessages = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const limit = Number(req.query.limit) || 50;

    const messages = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    // Return in chronological order (oldest first)
    return res.json(messages.reverse());
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({
      error: error.message || "Failed to fetch messages",
    });
  }
};

/**
 * POST /api/chat/:roomId/messages
 * Save a new message (the agent will also broadcast it over BLE)
 */
export const createMessage = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    const { roomId } = req.params;
    const { content, type = "text" } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const message = await prisma.chatMessage.create({
      data: {
        id: crypto.randomUUID(),
        roomId,
        senderId: user.id || user.sub,
        senderName: user.name || user.email || "Unknown",
        role: user.role || "student",
        isAdmin: user.role === "supervisor",
        type,
        content: content.trim(),
        timestamp: new Date(),
      },
    });
    return res.status(201).json(message);
  } catch (error: any) {
    console.error("Error creating message:", error);
    return res.status(500).json({
      error: error.message || "Failed to create message",
    });
  }
};