import { tool } from 'ai';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { z } from 'zod';

export const searchWebTool = tool({
  description:
    'Search the web for up-to-date information. Returns a list of relevant results with URLs, titles, and content snippets.',
  inputSchema: z.object({
    query: z.string().describe('The search query to look up on the web.'),
  }),
  execute: async ({ query }: { query: string }) => {
    try {
      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) {
        return {
          success: false,
          error: 'FIRECRAWL_API_KEY environment variable is not set.',
          data: [] as { url: string; title: string; content: string }[],
        };
      }

      // Dynamic import to avoid bundling issues
      const Firecrawl = (await import('@mendable/firecrawl-js')).default;
      const app = new Firecrawl({ apiKey });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (app as any).search(query, { limit: 5 });

      if (!response || !response.success) {
        return {
          success: false,
          error: 'Firecrawl search returned an error.',
          data: [] as { url: string; title: string; content: string }[],
        };
      }

      const data = ((response.data ?? []) as Array<{
        url?: string;
        title?: string;
        markdown?: string;
        description?: string;
      }>).map((item) => ({
        url: item.url ?? '',
        title: item.title ?? '',
        content: (item.markdown ?? item.description ?? '').substring(0, 2000),
      }));

      return { success: true, data };
    } catch (err) {
      return {
        success: false,
        error: formatToolError(err),
        data: [] as { url: string; title: string; content: string }[],
      };
    }
  },
});
