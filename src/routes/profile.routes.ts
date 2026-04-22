import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/profile/me:
 *   get:
 *     summary: Get the detailed profile of the authenticated user
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The user profile data
 *       404:
 *         description: Profile not found
 *       500:
 *         description: Internal server error
 */
router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user.sub || req.user.id;
        const role = req.user.role || 'student';

        if (role === 'student') {
            const { data: student, error } = await supabase
                .from('student_profiles')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error || !student) {
                return res.status(404).json({ error: 'Student profile not found.' });
            }
            return res.json({ profile: student, type: 'student' });
        } else if (role === 'company') {
            const { data: company, error } = await supabase
                .from('company_profiles')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error || !company) {
                return res.status(404).json({ error: 'Company profile not found.' });
            }
            return res.json({ profile: company, type: 'company' });
        } else {
            return res.status(400).json({ error: 'Invalid user role' });
        }
    } catch (err: any) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
