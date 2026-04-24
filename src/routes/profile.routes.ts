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

/**
 * @swagger
 * /api/profile/roles:
 *   get:
 *     summary: Get all active roles of the authenticated user
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
 */
router.get('/roles', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user.sub || req.user.id;
        const roles: string[] = [];

        // 1. Check Student Profile
        const { data: student } = await supabase
            .from('student_profiles')
            .select('id, full_name')
            .eq('user_id', userId)
            .maybeSingle();

        if (student) {
            roles.push('student');

            // Check if Intern
            const [internships, legacyInternships] = await Promise.all([
                supabase.from('internship_applications').select('id').eq('student_id', student.id).eq('status', 'accepted'),
                supabase.from('Applications').select('id').eq('student_id', student.id).eq('status', 'accepted').eq('application_type', 'internship')
            ]);

            if ((internships.data?.length || 0) > 0 || (legacyInternships.data?.length || 0) > 0) {
                roles.push('intern');
            }

            // Check Programs
            const { data: programApps } = await supabase
                .from('Applications')
                .select('id, programs(title)')
                .eq('student_id', student.id)
                .eq('status', 'accepted')
                .eq('application_type', 'program');

            if (programApps && programApps.length > 0) {
                programApps.forEach((app: any) => {
                    const programTitle = app.programs?.title || 'Unknown Program';
                    roles.push(`attending program: ${programTitle}`);
                });
            }
        }

        // 2. Check Supervisor Profile
        const { data: supervisor } = await supabase
            .from('supervisor_profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (supervisor) {
            roles.push('supervisor');
        }

        // 3. Check Company Profile
        const { data: company } = await supabase
            .from('company_profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (company) {
            roles.push('company');
        }

        return res.json({ roles });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

/**
 * @swagger
 * /api/profile/supervised-students:
 *   get:
 *     summary: Get students supervised by the current user
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of students
 */
router.get('/supervised-students', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user.sub || req.user.id;

        // Find supervisor profile
        const { data: supervisor } = await supabase
            .from('supervisor_profiles')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (!supervisor) {
            return res.status(403).json({ error: 'You are not a supervisor.' });
        }

        // Fetch students from both tables
        const [internships, legacyApps] = await Promise.all([
            supabase
                .from('internship_applications')
                .select('id, student_id, full_name, domain, status, created_at')
                .eq('supervisor_id', supervisor.id)
                .eq('status', 'accepted'),
            supabase
                .from('Applications')
                .select('id, student_id, student:student_profiles(full_name), department, status, created_at')
                .eq('supervisor_id', supervisor.id)
                .eq('status', 'accepted')
        ]);

        const students = [
            ...(internships.data || []).map(s => ({
                id: s.student_id,
                name: s.full_name,
                domain: s.domain,
                status: s.status,
                joined_at: s.created_at
            })),
            ...(legacyApps.data || []).map((s: any) => {
                const studentProfile = Array.isArray(s.student) ? s.student[0] : s.student;
                return {
                    id: s.student_id,
                    name: studentProfile?.full_name || 'Unknown Student',
                    domain: s.department,
                    status: s.status,
                    joined_at: s.created_at
                };
            })
        ];

        return res.json({ students });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
