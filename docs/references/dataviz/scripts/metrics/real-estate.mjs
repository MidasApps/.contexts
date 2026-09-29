/**
 * Catálogo `imobiliaria.*` — 268 métricas em 8 grupos (docs/real-estate-demo-catalog.md §4).
 * Convenções de período e helpers em `./real-estate/_helpers.mjs`.
 */
import { metrics as executive } from './real-estate/executive.mjs';
import { metrics as launches } from './real-estate/launches.mjs';
import { metrics as readyUnits } from './real-estate/ready-units.mjs';
import { metrics as rental } from './real-estate/rental.mjs';
import { metrics as marketing } from './real-estate/marketing.mjs';
import { metrics as finance } from './real-estate/finance.mjs';
import { metrics as team } from './real-estate/team.mjs';
import { metrics as customerService } from './real-estate/customer-service.mjs';

export const groups = { executive, launches, readyUnits, rental, marketing, finance, team, customerService };
export const metrics = Object.values(groups).flat();
