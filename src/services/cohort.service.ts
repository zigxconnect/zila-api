import { supabase } from '../config/supabase';
import { prisma } from '../config/prisma';

export interface ChatGroupMember {
  id: string;
  studentId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  isAdmin: boolean;
  totalPoints: number;
}

export interface BluetoothChatContext {
  chatRoomId: string;
  cohortId: string;
  cohortName: string;
  department: string;
  supervisorAdmin: {
    id: string;
    name: string;
    email: string;
    role: string;
    isAdmin: true;
  } | null;
  members: ChatGroupMember[];
  totalMembers: number;
}

export class CohortService {
  /**
   * Synchronize student placements from Supabase into Neon DB (Prisma).
   * Pulls accepted internships/programs matching domain/track (e.g. "Ai/Machine Learning"),
   * links the supervisor, and discovers fellow interns accepted in the same cohort.
   */
  static async syncStudentPlacements(userId: string): Promise<any[]> {
    try {
      // 1. Get student profile from Supabase
      const { data: studentProfile } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const studentName = studentProfile?.full_name || 'Intern';
      const studentEmail = studentProfile?.email || '';
      const avatarUrl = studentProfile?.avatar_url || null;
      const profileId = studentProfile?.id;

      // 2. Fetch accepted placements from Applications
      let apps: any[] = [];
      if (profileId) {
        const { data: appData } = await supabase
          .from('Applications')
          .select(`
            id,
            internship_id,
            program_id,
            event_id,
            application_type,
            department,
            status,
            supervisor_id,
            internships (id, title, location, start_date, end_date),
            programs (id, title, location, start_date, end_date),
            supervisor_profiles (id, user_id, full_name, email)
          `)
          .eq('student_id', profileId)
          .in('status', ['accepted', 'rsvp_confirmed']);

        if (appData) apps = [...appData];
      }

      // 3. Fetch accepted placements from legacy internship_applications
      const { data: legacyApps } = await supabase
        .from('internship_applications')
        .select(`
          id,
          internship_id,
          domain,
          status,
          supervisor_id,
          internships (id, title, location, start_date, end_date),
          supervisor_profiles (id, user_id, full_name, email)
        `)
        .eq('student_id', userId)
        .eq('status', 'accepted');

      if (legacyApps) {
        for (const leg of legacyApps) {
          apps.push({
            id: leg.id,
            internship_id: leg.internship_id,
            application_type: 'internship',
            department: leg.domain || '',
            status: leg.status,
            supervisor_id: leg.supervisor_id,
            internships: leg.internships,
            supervisor_profiles: leg.supervisor_profiles,
          });
        }
      }

      const syncedCohorts: any[] = [];

      for (const app of apps) {
        const type = (app.application_type || 'internship').toLowerCase();
        const opportunity = type === 'program' ? app.programs : app.internships;
        const refId = app.program_id || app.internship_id;
        if (!refId && !opportunity?.id) continue;

        const actualRefId = refId || opportunity.id;
        const rawTitle = opportunity?.title || 'Internship Program';
        const department = app.department || 'General';
        const cohortName = `${rawTitle} - ${department}`;

        // Supervisor details
        const supervisor = Array.isArray(app.supervisor_profiles)
          ? app.supervisor_profiles[0]
          : app.supervisor_profiles;
        const supervisorId = supervisor?.user_id || supervisor?.id || app.supervisor_id || null;
        const supervisorName = supervisor?.full_name || 'Program Supervisor';
        const supervisorEmail = supervisor?.email || '';

        // Upsert Cohort in Neon DB via Prisma
        let cohort = await prisma.cohort.findFirst({
          where: {
            programId: actualRefId,
            department: department,
          },
        });

        const startDate = opportunity?.start_date ? new Date(opportunity.start_date) : new Date();
        const endDate = opportunity?.end_date ? new Date(opportunity.end_date) : new Date(Date.now() + 90 * 24 * 3600 * 1000);

        if (!cohort) {
          cohort = await prisma.cohort.create({
            data: {
              name: cohortName,
              programId: actualRefId,
              programType: type,
              department: department,
              level: 'intermediate',
              startDate,
              endDate,
              isActive: true,
              supervisorId,
              supervisorName,
              supervisorEmail,
            },
          });
        } else if (supervisorId && !cohort.supervisorId) {
          cohort = await prisma.cohort.update({
            where: { id: cohort.id },
            data: {
              supervisorId,
              supervisorName,
              supervisorEmail,
            },
          });
        }

        // Upsert current student in CohortStudent
        await prisma.cohortStudent.upsert({
          where: {
            cohortId_studentId: {
              cohortId: cohort.id,
              studentId: userId,
            },
          },
          update: {
            studentName,
            studentEmail,
            avatarUrl,
            status: 'active',
          },
          create: {
            cohortId: cohort.id,
            studentId: userId,
            studentName,
            studentEmail,
            avatarUrl,
            status: 'active',
          },
        });

        // 4. Discover and sync fellow interns accepted in the same cohort / department
        await this.syncFellowInterns(cohort.id, actualRefId, department);

        syncedCohorts.push(cohort);
      }

      return syncedCohorts;
    } catch (error) {
      console.error('[CohortService] Sync failed:', error);
      return [];
    }
  }

  /**
   * Discovers fellow interns accepted in the same program/internship and domain/track
   * and synchronizes them into the Neon DB CohortStudent table.
   */
  private static async syncFellowInterns(cohortId: string, refId: string, department: string) {
    try {
      // Find matching peers from Applications
      let appQuery = supabase
        .from('Applications')
        .select(`
          student_id,
          student_profiles (id, user_id, full_name, email, avatar_url)
        `)
        .in('status', ['accepted', 'rsvp_confirmed'])
        .or(`internship_id.eq.${refId},program_id.eq.${refId}`);

      if (department && department !== 'General') {
        appQuery = appQuery.eq('department', department);
      }

      const { data: peerApps } = await appQuery;

      if (peerApps) {
        for (const peerApp of peerApps) {
          const profile = Array.isArray(peerApp.student_profiles)
            ? peerApp.student_profiles[0]
            : peerApp.student_profiles;

          if (profile?.user_id) {
            await prisma.cohortStudent.upsert({
              where: {
                cohortId_studentId: {
                  cohortId,
                  studentId: profile.user_id,
                },
              },
              update: {
                studentName: profile.full_name || 'Fellow Intern',
                studentEmail: profile.email || '',
                avatarUrl: profile.avatar_url || null,
              },
              create: {
                cohortId,
                studentId: profile.user_id,
                studentName: profile.full_name || 'Fellow Intern',
                studentEmail: profile.email || '',
                avatarUrl: profile.avatar_url || null,
                status: 'active',
              },
            });
          }
        }
      }

      // Also check legacy internship_applications
      let legQuery = supabase
        .from('internship_applications')
        .select(`
          student_id
        `)
        .eq('internship_id', refId)
        .eq('status', 'accepted');

      if (department && department !== 'General') {
        legQuery = legQuery.eq('domain', department);
      }

      const { data: legacyPeers } = await legQuery;
      if (legacyPeers) {
        for (const leg of legacyPeers) {
          if (!leg.student_id) continue;
          // Query profile
          const { data: p } = await supabase
            .from('student_profiles')
            .select('user_id, full_name, email, avatar_url')
            .or(`user_id.eq.${leg.student_id},id.eq.${leg.student_id}`)
            .maybeSingle();

          const studentUserId = p?.user_id || leg.student_id;
          await prisma.cohortStudent.upsert({
            where: {
              cohortId_studentId: {
                cohortId,
                studentId: studentUserId,
              },
            },
            update: {
              studentName: p?.full_name || 'Fellow Intern',
              studentEmail: p?.email || '',
              avatarUrl: p?.avatar_url || null,
            },
            create: {
              cohortId,
              studentId: studentUserId,
              studentName: p?.full_name || 'Fellow Intern',
              studentEmail: p?.email || '',
              avatarUrl: p?.avatar_url || null,
              status: 'active',
            },
          });
        }
      }
    } catch (err) {
      console.warn('[CohortService] syncFellowInterns warning:', err);
    }
  }

  /**
   * Get all cohorts enrolled by the student
   */
  static async getStudentCohorts(userId: string) {
    // Proactively sync latest placements
    await this.syncStudentPlacements(userId);

    const enrolled = await prisma.cohortStudent.findMany({
      where: { studentId: userId },
      include: {
        cohort: {
          include: {
            _count: {
              select: { students: true, tasks: true, documents: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return enrolled.map((item) => ({
      ...item.cohort,
      enrollmentStatus: item.status,
      joinedAt: item.joinedAt,
      studentRole: item.role,
    }));
  }

  /**
   * Get fellow accepted interns in the same cohort
   */
  static async getCohortPeers(cohortId: string, currentUserId: string) {
    const peers = await prisma.cohortStudent.findMany({
      where: {
        cohortId,
        status: 'active',
        studentId: { not: currentUserId },
      },
      include: {
        gamificationPoints: {
          select: { points: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return peers.map((p) => ({
      id: p.id,
      studentId: p.studentId,
      studentName: p.studentName,
      studentEmail: p.studentEmail,
      avatarUrl: p.avatarUrl,
      role: p.role,
      joinedAt: p.joinedAt,
      status: p.status,
      totalPoints: p.gamificationPoints.reduce((sum, gp) => sum + gp.points, 0),
    }));
  }

  /**
   * Returns complete context for the future Bluetooth group chat:
   * Cohort metadata, supervisor as Admin, and all accepted student members.
   */
  static async getBluetoothChatContext(cohortId: string, currentUserId: string): Promise<BluetoothChatContext> {
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        students: {
          include: {
            gamificationPoints: {
              select: { points: true },
            },
          },
        },
      },
    });

    if (!cohort) {
      throw new Error(`Cohort with ID ${cohortId} not found`);
    }

    const members: ChatGroupMember[] = cohort.students.map((student) => ({
      id: student.id,
      studentId: student.studentId,
      name: student.studentName,
      email: student.studentEmail,
      avatarUrl: student.avatarUrl,
      role: student.role,
      isAdmin: false,
      totalPoints: student.gamificationPoints.reduce((sum, gp) => sum + gp.points, 0),
    }));

    const supervisorAdmin = cohort.supervisorId
      ? {
          id: cohort.supervisorId,
          name: cohort.supervisorName || 'Supervisor',
          email: cohort.supervisorEmail || '',
          role: 'supervisor',
          isAdmin: true as const,
        }
      : null;

    // Room ID format suitable for Bluetooth advertising and discovery:
    // e.g. "zigex-cohort-<cleanId>"
    const chatRoomId = `zigex-cohort-${cohort.id.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    return {
      chatRoomId,
      cohortId: cohort.id,
      cohortName: cohort.name,
      department: cohort.department,
      supervisorAdmin,
      members,
      totalMembers: members.length + (supervisorAdmin ? 1 : 0),
    };
  }
}
