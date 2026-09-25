import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const achievements = [
  {
    name: "First Steps",
    description: "Complete your first task",
    icon: "🎯",
    category: "consistency",
    pointsRequired: 50,
    condition: JSON.stringify({ tasksCompleted: 1 })
  },
  {
    name: "Early Bird",
    description: "Submit 5 tasks before the deadline",
    icon: "🌅",
    category: "consistency",
    pointsRequired: 100,
    condition: JSON.stringify({ earlySubmissions: 5 })
  },
  {
    name: "Perfect Week",
    description: "Complete all tasks in a week",
    icon: "⭐",
    category: "consistency",
    pointsRequired: 200,
    condition: JSON.stringify({ weeklyCompletionRate: 100 })
  },
  {
    name: "Code Master",
    description: "Get 3 tasks approved with 90+ points",
    icon: "💎",
    category: "quality",
    pointsRequired: 300,
    condition: JSON.stringify({ highQualityTasks: 3, minPoints: 90 })
  },
  {
    name: "Team Player",
    description: "Help 5 peers with their tasks",
    icon: "🤝",
    category: "collaboration",
    pointsRequired: 150,
    condition: JSON.stringify({ peersHelped: 5 })
  },
  {
    name: "Speed Demon",
    description: "Submit a task within 24 hours of assignment",
    icon: "⚡",
    category: "speed",
    pointsRequired: 75,
    condition: JSON.stringify({ quickSubmission: true })
  },
  {
    name: "Persistent Learner",
    description: "Work on tasks for 7 consecutive days",
    icon: "🔥",
    category: "consistency",
    pointsRequired: 250,
    condition: JSON.stringify({ streak: 7 })
  },
  {
    name: "Knowledge Seeker",
    description: "Access learning documents 20 times",
    icon: "📚",
    category: "consistency",
    pointsRequired: 100,
    condition: JSON.stringify({ documentAccess: 20 })
  },
  {
    name: "Top Performer",
    description: "Rank in top 3 of your cohort",
    icon: "🥇",
    category: "speed",
    pointsRequired: 500,
    condition: JSON.stringify({ topRank: 3 })
  },
  {
    name: "Rising Star",
    description: "Earn 1000 total points",
    icon: "🌟",
    category: "quality",
    pointsRequired: 1000,
    condition: JSON.stringify({ totalPoints: 1000 })
  },
  {
    name: "Git Guru",
    description: "Submit 10 tasks with proper PR workflow",
    icon: "🔀",
    category: "quality",
    pointsRequired: 300,
    condition: JSON.stringify({ prSubmissions: 10 })
  },
  {
    name: "Comeback Champion",
    description: "Improve your weekly score by 30%",
    icon: "📈",
    category: "consistency",
    pointsRequired: 200,
    condition: JSON.stringify({ scoreImprovement: 30 })
  },
  {
    name: "Mentor",
    description: "Help 10 peers in your cohort",
    icon: "🎓",
    category: "collaboration",
    pointsRequired: 400,
    condition: JSON.stringify({ peersHelped: 10 })
  },
  {
    name: "Overachiever",
    description: "Complete 50 tasks",
    icon: "🏆",
    category: "consistency",
    pointsRequired: 2000,
    condition: JSON.stringify({ tasksCompleted: 50 })
  },
  {
    name: "Perfect Score",
    description: "Get 100/100 on a task",
    icon: "💯",
    category: "quality",
    pointsRequired: 500,
    condition: JSON.stringify({ perfectScore: true })
  }
];

async function seedAchievements() {
  console.log('🌱 Seeding achievements...');

  try {
    for (const achievement of achievements) {
      const existing = await prisma.achievement.findUnique({
        where: { name: achievement.name }
      });

      if (existing) {
        console.log(`   ⏭️  Skipping "${achievement.name}" (already exists)`);
        continue;
      }

      await prisma.achievement.create({
        data: achievement
      });

      console.log(`   ✅ Created "${achievement.name}"`);
    }

    console.log('\n✨ Seeding complete!');
    console.log(`   Total achievements: ${achievements.length}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seeding
seedAchievements()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
