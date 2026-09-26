import { Router, Response } from "express";
import { supabase } from "../config/supabase";
import {
  authMiddleware,
  AuthenticatedRequest,
} from "../middlewares/auth.middleware";

import { PrismaClient } from "../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const router = Router();

/**
 * @swagger
 * /api/submit-report:
 *   post:
 *     summary: Creates a report for the authenticated user
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *               type: object
 *               required: [title, summary, status]
 *               properties:
 *                    title:
 *                        type: string
 *                        example: "Typescript Mastery"
 *                    summary:
 *                        type: string
 *                        example: "Typescript is JS with strict types"
 *                    status:
 *                        type: string
 *                        example: "draft"
 *                    notes:
 *                        type: string
 *                        example: "Typescript has interface, types etc"
 *     responses:
 *       200:
 *         description: Report created
 *       404:
 *         description: Student profile not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/submit-report",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Authenticating and getting the users info to get a reference of the person that submitted the report
      const userId = req.user.sub || req.user.id;
      const role = req.user.role || "student";

      const { title, summary, notes, status } = req.body;

      const timeNow = new Date().getHours();
      const cutOffTime = 15;
      if (cutOffTime > timeNow) {
        return res.status(400).json({
          success: false,
          message: "Cannot submit before 3PM",
        });
      }

      if (!title || !status || !summary) {
        return res.status(400).json({ error: "Missing required fields." });
      }

      if (role === "student") {
        const { data: student, error } = await supabase
          .from("student_profiles")
          .select("full_name, email")
          .eq("user_id", userId)
          .maybeSingle();

        if (error || !student) {
          return res.status(404).json({ error: "Student profile not found." });
        }
        // return res.json({ profile: student, type: "student" });
        const studentEmail = student?.email;
        const submittedBy = student?.full_name;

        const newReport = await prisma.submit_report.create({
          data: {
            title,
            summary,
            notes,
            status,
            studentEmail,
            submittedBy,
          },
        });

        return res.status(201).json({
          success: true,
          message: "Report Submitted successfully",
          report: newReport,
        });
      }
    } catch (err: any) {
      console.error(err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to submit report",
      });
    }
  },
);

//The get route to see an interns reports that he submitted

/**
 * @swagger
 * /api/submit-report:
 *   get:
 *     summary: Gets all report for the authenticated user
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 *       404:
 *         description: Student profile not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/submit-report",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Authenticating and getting the users info to get a reference of the person that submitted the report
      const userId = req.user.sub || req.user.id;
      const role = req.user.role || "student";

      if (role === "student") {
        const { data: student, error } = await supabase
          .from("student_profiles")
          .select("full_name, email")
          .eq("user_id", userId)
          .maybeSingle();

        if (error || !student) {
          return res.status(404).json({ error: "Student profile not found." });
        }
        // return res.json({ profile: student, type: "student" });
        const studentEmail = student?.email;
        const submittedBy = student.full_name;

        const internReport = await prisma.submit_report.findMany({
          where: { studentEmail: studentEmail },
          orderBy: { submittedAt: "desc" },
          select: {
            title: true,
            summary: true,
            notes: true,
            status: true,
          },
        });

        return res.status(201).json({
          FullName: submittedBy,
          Email: studentEmail,
          reports: internReport,
        });
      }
    } catch (err: any) {
      console.error(err.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch interns reports",
      });
    }
  },
);

export default router;
