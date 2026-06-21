import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { config } from './config';
import authRouter from './routes/auth';
import projectsRouter from './routes/projects';
import { templateRouter, sectionRouter } from './routes/consultant-templates';
import { categoriesRouter, categoryRequirementsRouter } from './routes/categories';
import { documentTypesRouter } from './routes/document-types';
import { filesRouter } from './routes/files';
import { projectFilesNestedRouter, projectFileRouter } from './routes/project-files';
import { productsNestedRouter, productRouter } from './routes/products';
import { extractionNestedRouter, extractionJobRouter } from './routes/extraction';
import { checklistNestedRouter, checklistItemRouter } from './routes/checklist';
import {
  specProjectRouter,
  specDocumentRouter,
  specRequirementRouter,
  specComparisonRouter,
  specComparisonResultRouter,
} from './routes/spec';
import { boqProjectRouter, boqItemRouter } from './routes/boq';
import { priceListProjectRouter, priceListRouter } from './routes/price-lists';
import { exportProjectRouter, exportRouter } from './routes/exports';
import { profilesRouter, accessoriesRouter, configuredProductsRouter } from './routes/catalogue';
import { ingestionRouter } from './routes/ingestion';
import { matchingRouter } from './routes/matching';
import { errorHandler } from './middleware/error-handler';

const app = express();

app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  }),
);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', env: config.nodeEnv }));
app.use('/auth', authRouter);
app.use('/projects', projectsRouter);
app.use('/consultant-templates', templateRouter);
app.use('/consultant-template-sections', sectionRouter);
app.use('/categories', categoriesRouter);
app.use('/category-requirements', categoryRequirementsRouter);
app.use('/document-types', documentTypesRouter);
app.use('/files', filesRouter);
app.use('/projects', projectFilesNestedRouter);
app.use('/project-files', projectFileRouter);
app.use('/projects', productsNestedRouter);
app.use('/products', productRouter);
app.use('/project-files', extractionNestedRouter);
app.use('/extraction-jobs', extractionJobRouter);
app.use('/projects', checklistNestedRouter);
app.use('/checklist-items', checklistItemRouter);
app.use('/projects', specProjectRouter);
app.use('/spec-documents', specDocumentRouter);
app.use('/spec-requirements', specRequirementRouter);
app.use('/spec-comparisons', specComparisonRouter);
app.use('/spec-comparison-results', specComparisonResultRouter);
app.use('/projects', boqProjectRouter);
app.use('/boq-items', boqItemRouter);
app.use('/projects', priceListProjectRouter);
app.use('/price-lists', priceListRouter);
app.use('/projects', exportProjectRouter);
app.use('/exports', exportRouter);
app.use('/catalogue/profiles', profilesRouter);
app.use('/catalogue/accessories', accessoriesRouter);
app.use('/configured-products', configuredProductsRouter);
app.use('/ingestion', ingestionRouter);
app.use('/matching', matchingRouter);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`LightSelect API running on http://localhost:${config.port}`);
});

export default app;
