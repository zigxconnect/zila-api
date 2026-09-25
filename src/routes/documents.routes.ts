import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authMiddleware, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });
const router = Router();

/**
 * @swagger
 * /api/documents/{cohortId}:
 *   get:
 *     summary: Get all documents for a cohort
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:cohortId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cohortId } = req.params;
    const { category, search } = req.query;

    const where: any = {
      cohortId,
      isPublic: true
    };

    if (category) where.category = category as string;

    let documents = await prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    // Simple search by title/keywords if search param provided
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      documents = documents.filter(doc =>
        doc.title.toLowerCase().includes(searchTerm) ||
        doc.keywords.some(k => k.toLowerCase().includes(searchTerm))
      );
    }

    return res.json({ documents });
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

/**
 * @swagger
 * /api/documents:
 *   post:
 *     summary: Upload a document (Supervisor only)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can upload documents' });
    }

    // Get supervisor profile
    const { data: supervisor, error } = await supabase
      .from('supervisor_profiles')
      .select('full_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !supervisor) {
      return res.status(404).json({ error: 'Supervisor profile not found' });
    }

    const {
      cohortId,
      title,
      description,
      fileUrl,
      fileType,
      fileSize,
      category,
      keywords,
      isPublic
    } = req.body;

    // Validate cohort exists
    const cohort = await prisma.cohort.findUnique({
      where: { id: cohortId }
    });

    if (!cohort) {
      return res.status(404).json({ error: 'Cohort not found' });
    }

    const document = await prisma.document.create({
      data: {
        cohortId,
        title,
        description,
        fileUrl,
        fileType,
        fileSize,
        category,
        keywords: keywords || [],
        isPublic: isPublic !== false,
        uploadedBy: userId,
        uploadedByName: supervisor.full_name,
        isIndexed: false
      }
    });

    // TODO: Trigger RAG indexing job here
    // This would process the document and create embeddings for semantic search

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      document
    });
  } catch (error: any) {
    console.error('Error uploading document:', error);
    return res.status(500).json({ error: 'Failed to upload document' });
  }
});

/**
 * @swagger
 * /api/documents/{documentId}:
 *   delete:
 *     summary: Delete a document (Supervisor only)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:documentId', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.sub || req.user.id;
    const role = req.user.role || 'student';

    if (role !== 'supervisor' && role !== 'company') {
      return res.status(403).json({ error: 'Only supervisors can delete documents' });
    }

    // Verify document exists and user uploaded it
    const document = await prisma.document.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (document.uploadedBy !== userId) {
      return res.status(403).json({ error: 'You can only delete documents you uploaded' });
    }

    await prisma.document.delete({
      where: { id: documentId }
    });

    return res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
});

/**
 * @swagger
 * /api/documents/{documentId}/index:
 *   post:
 *     summary: Mark document as indexed (for RAG system)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:documentId/index', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    const { vectorStoreId } = req.body;

    const document = await prisma.document.update({
      where: { id: documentId },
      data: {
        isIndexed: true,
        vectorStoreId
      }
    });

    return res.json({
      success: true,
      message: 'Document marked as indexed',
      document
    });
  } catch (error: any) {
    console.error('Error updating document index status:', error);
    return res.status(500).json({ error: 'Failed to update document' });
  }
});

/**
 * @swagger
 * /api/documents/search:
 *   post:
 *     summary: Semantic search across documents (RAG)
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 */
router.post('/search', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, cohortId, limit = 5 } = req.body;

    // TODO: Implement vector similarity search using your RAG system
    // For now, return keyword-based search
    const documents = await prisma.document.findMany({
      where: {
        cohortId,
        isIndexed: true,
        isPublic: true,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { keywords: { has: query.toLowerCase() } }
        ]
      },
      take: parseInt(limit),
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      query,
      results: documents,
      note: 'Semantic search will be enhanced with vector embeddings'
    });
  } catch (error: any) {
    console.error('Error searching documents:', error);
    return res.status(500).json({ error: 'Failed to search documents' });
  }
});

export default router;
