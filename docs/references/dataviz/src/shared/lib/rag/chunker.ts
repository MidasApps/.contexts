import matter from 'gray-matter';

export interface Chunk {
  text: string;
  metadata: Record<string, unknown>;
}

export function chunkMarkdown(raw: string, opts: { maxChars?: number } = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 1500;
  const parsed = matter(raw);
  const content = parsed.content;
  const frontmatter = parsed.data as Record<string, unknown>;
  const hasFrontmatter = Object.keys(frontmatter).length > 0;

  const lines = content.split('\n');
  const sections: { headingPath: string[]; body: string[] }[] = [];
  let current: { headingPath: string[]; body: string[] } | null = null;
  const stack: string[] = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,2})\s+(.*)$/);
    if (m) {
      const depth = m[1]!.length;
      stack.length = depth - 1;
      stack[depth - 1] = m[2]!.trim();
      current = { headingPath: stack.filter(Boolean).slice(), body: [] };
      sections.push(current);
    } else {
      if (!current) {
        current = { headingPath: [], body: [] };
        sections.push(current);
      }
      current.body.push(line);
    }
  }

  const out: Chunk[] = [];
  for (const s of sections) {
    const body = s.body.join('\n').trim();
    if (!body) continue;
    const headerLine = s.headingPath.length
      ? `${'#'.repeat(s.headingPath.length)} ${s.headingPath.at(-1)}\n\n`
      : '';
    const fullText = headerLine + body;
    const baseMeta = {
      headingPath: s.headingPath,
      ...(hasFrontmatter ? { frontmatter } : {}),
    };
    if (fullText.length <= maxChars) {
      out.push({ text: fullText, metadata: baseMeta });
    } else {
      const window = Math.max(1, maxChars - headerLine.length);
      for (let i = 0; i < body.length; i += window) {
        const slice = body.slice(i, i + window);
        out.push({
          text: headerLine + slice,
          metadata: {
            ...baseMeta,
            splitOf: i === 0 ? 'first' : 'overflow',
          },
        });
      }
    }
  }
  return out;
}

export function chunkJson(
  obj: Record<string, string>,
  opts: { keyField: string; valueField: string },
): Chunk[] {
  return Object.entries(obj).map(([k, v]) => ({
    text: `${opts.keyField}: ${k}\n${opts.valueField}: ${v}`,
    metadata: { [opts.keyField]: k },
  }));
}
