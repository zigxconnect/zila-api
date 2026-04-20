import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/events/my-events:
 *   get:
 *     summary: Get all event RSVPs/applications for the authenticated user
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of events
 *       404:
 *         description: Student profile not found
 *       500:
 *         description: Internal server error
 */
router.get('/my-events', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user.sub || req.user.id;
        
        // Fetch student profile ID first
        const { data: student, error: studentError } = await supabase
            .from('student_profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (studentError || !student) {
            return res.status(404).json({ error: 'Student profile not found.' });
        }

        const studentProfileId = student.id;

        const { data, error } = await supabase
            .from('Applications')
            .select(`
                id,
                status,
                created_at,
                event (
                    title,
                    description,
                    location,
                    start_date,
                    end_date,
                    start_time,
                    company_profiles (
                        company_name,
                        industry
                    )
                )
            `)
            .eq('student_id', studentProfileId)
            .eq('application_type', 'event');

        if (error) {
            console.error('Error fetching events:', error);
            return res.status(500).json({ error: 'Failed to fetch event records' });
        }

        return res.json({ events: data });

    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
