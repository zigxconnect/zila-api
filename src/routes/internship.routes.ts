import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/internship/my-internships:
 *   get:
 *     summary: Get all internship applications for the authenticated user
 *     tags: [Internships]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of internship applications
 *       404:
 *         description: Student profile not found
 *       500:
 *         description: Internal server error
 */
router.get('/my-internships', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user.sub || req.user.id; // auth.users.id
        
        // Fetch internship applications for the student
        const { data, error } = await supabase
            .from('internship_applications')
            .select(`
                id,
                status,
                created_at,
                internships (
                    title,
                    description,
                    location,
                    is_paid,
                    company_profiles (
                        company_name,
                        industry
                    )
                ),
                supervisor_profiles (
                    full_name,
                    email,
                    department
                )
            `)
            .eq('student_id', userId);

        if (error) {
            console.error('Error fetching internships:', error);
            return res.status(500).json({ error: 'Failed to fetch internship records' });
        }

        return res.json({ internships: data });

    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
