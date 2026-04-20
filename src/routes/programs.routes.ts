import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/programs/my-programs:
 *   get:
 *     summary: Get all program applications for the authenticated user
 *     tags: [Programs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of program applications
 *       404:
 *         description: Student profile not found
 *       500:
 *         description: Internal server error
 */
router.get('/my-programs', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user.sub || req.user.id; // auth.users.id
        
        // Fetch program applications for the student.
        // Wait: The Applications table uses 'student_id' mapped to 'public.student_profiles.id', NOT auth.users.id!
        // Let's first fetch the student profile ID using the auth user id.
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
                programs (
                    title,
                    description,
                    program_category,
                    location,
                    type,
                    start_date,
                    end_date,
                    is_paid,
                    company_profiles (
                        company_name,
                        industry
                    )
                )
            `)
            .eq('student_id', studentProfileId)
            .eq('application_type', 'program');

        if (error) {
            console.error('Error fetching programs:', error);
            return res.status(500).json({ error: 'Failed to fetch program records' });
        }

        return res.json({ programs: data });

    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
