export interface MarkdownSection {
  id?: string;
  title: string;
  content: string;
  level: number;
  orderIndex: number;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function extractTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return fallback;
  return match[1]
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim() || fallback;
}

export function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = markdown.split('\n');
  let current: Omit<MarkdownSection, 'orderIndex'> | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const header = line.match(/^(#{1,6})\s+(.+)$/);
    if (header) {
      if (current) {
        sections.push({
          ...current,
          content: currentContent.join('\n').trim(),
          orderIndex: sections.length,
        });
      }
      current = {
        title: header[2].trim(),
        level: header[1].length,
        content: '',
      };
      currentContent = [];
      continue;
    }

    if (current) {
      currentContent.push(line);
    } else if (line.trim()) {
      current = {
        title: 'Introduction',
        level: 1,
        content: '',
      };
      currentContent.push(line);
    }
  }

  if (current) {
    sections.push({
      ...current,
      content: currentContent.join('\n').trim(),
      orderIndex: sections.length,
    });
  }

  if (sections.length === 0 && markdown.trim()) {
    sections.push({
      title: 'Content',
      level: 1,
      content: markdown.trim(),
      orderIndex: 0,
    });
  }

  return sections;
}

export function renderSectionsAsMarkdown(title: string, sections: MarkdownSection[]): string {
  const body = sections
    .map((section) => `${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`.trim())
    .join('\n\n');

  return body.match(/^#\s+/m) ? body : `# ${title}\n\n${body}`;
}
