import { makeAiStudioRoutes } from '../route-factory';

export const runtime = 'nodejs';
export const { GET, POST, PATCH, DELETE } = makeAiStudioRoutes('workflow');
