import { Router } from 'express';
import uploadRoutes from './upload';
import projectionRoutes from './projections';
import routingRoutes from './routing';

const router = Router();

router.use('/upload', uploadRoutes);
router.use('/projections', projectionRoutes);
router.use('/routing', routingRoutes);

export default router;