import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middlewares/auth.middleware";
import { prisma } from "../config/prisma";

const router = Router();

// GET /api/chat/sessions - List chat sessions for user
router.get("/sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const studentEmail = req.user?.email || (req.query.email as string);
    if (!studentEmail) {
      return res.status(400).json({ success: false, message: "User email required" });
    }

    const sessions = await prisma.chatSession.findMany({
      where: {
        studentEmail: {
          equals: studentEmail,
          mode: "insensitive",
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return res.json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        cohortId: s.cohortId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length,
        preview: s.messages[0]?.content?.slice(0, 80) || s.title,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/chat/sessions/:id - Get specific session with messages
router.get("/sessions/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const session = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return res.status(404).json({ success: false, message: "Chat session not found" });
    }

    return res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/chat/sessions - Create or update chat session with messages
router.post("/sessions", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const studentEmail = req.user?.email || req.body.studentEmail;
    const { id, title, cohortId, messages } = req.body;

    if (!studentEmail) {
      return res.status(400).json({ success: false, message: "Student email required" });
    }

    const sessionTitle = title || (Array.isArray(messages) && messages[0]?.content ? messages[0].content.slice(0, 50) : "Chat Session");

    let session: any;
    if (id) {
      // Upsert existing session
      session = await prisma.chatSession.upsert({
        where: { id },
        create: {
          id,
          studentEmail,
          cohortId: cohortId || null,
          title: sessionTitle,
        },
        update: {
          title: sessionTitle,
          updatedAt: new Date(),
        },
      });

      // If new messages provided, append them
      if (Array.isArray(messages) && messages.length > 0) {
        // Delete old messages to replace with current session state
        await prisma.chatMessageRecord.deleteMany({
          where: { sessionId: session.id },
        });

        await prisma.chatMessageRecord.createMany({
          data: messages.map((m: any) => ({
            sessionId: session.id,
            role: m.role || "user",
            content: m.content || "",
            createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
          })),
        });
      }
    } else {
      // Create new session
      session = await prisma.chatSession.create({
        data: {
          studentEmail,
          cohortId: cohortId || null,
          title: sessionTitle,
          messages: Array.isArray(messages) && messages.length > 0
            ? {
                create: messages.map((m: any) => ({
                  role: m.role || "user",
                  content: m.content || "",
                  createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                })),
              }
            : undefined,
        },
        include: {
          messages: true,
        },
      });
    }

    return res.json({
      success: true,
      session,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
