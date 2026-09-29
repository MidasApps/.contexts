import { SQL_RULES, RESPONSE_GUIDELINES, buildBusinessContext } from '@/shared/config/agents';
import { PORTFOLIO_SCHEMA_TEXT } from './portfolio-schema-text';

/** Textos canônicos das 4 skills de sistema (espelham os helpers compartilhados). */
export const RESPONSE_STYLE_PLAYBOOK = RESPONSE_GUIDELINES;
export const SQL_FOUNDATIONS_PLAYBOOK = SQL_RULES;
export const PORTFOLIO_SCHEMA_PLAYBOOK = PORTFOLIO_SCHEMA_TEXT;
export const CREDIT_DOMAIN_PLAYBOOK = buildBusinessContext();
