import type {
  ShotCount,
  StripTemplate,
  StripTemplateSummary,
} from '@vyora/shared';

type TemplateIdentity = Pick<StripTemplate, 'id' | 'name' | 'builtIn'>;

/** Variants remain distinct capture assets but share one visible frame choice. */
export function frameChoiceId(template: TemplateIdentity): string {
  return template.builtIn ? template.id.replace(/-[234]$/, '') : template.id;
}

export function frameChoiceName(template: TemplateIdentity): string {
  return template.builtIn
    ? template.name.replace(/\s*·\s*[234] photos$/, '')
    : template.name;
}

export function resolveFrameChoice(
  templates: StripTemplateSummary[],
  id: string,
  shots: ShotCount,
): StripTemplateSummary | undefined {
  const choice = templates.find(
    (template) => template.id === id || frameChoiceId(template) === id,
  );
  if (!choice || !choice.builtIn) return choice;
  const variants = templates.filter(
    (template) => frameChoiceId(template) === frameChoiceId(choice),
  );
  return (
    variants.find((template) => template.slots.length === shots) ??
    (variants.length === 1 ? variants[0] : undefined)
  );
}

export function groupFrameChoices(
  templates: StripTemplateSummary[],
  shots: ShotCount,
) {
  const seen = new Set<string>();
  return templates.flatMap((template) => {
    const id = frameChoiceId(template);
    if (seen.has(id)) return [];
    seen.add(id);
    const variant = resolveFrameChoice(templates, id, shots);
    return variant
      ? [{ id, name: frameChoiceName(template), template: variant }]
      : [];
  });
}

/** Migrate previously saved variant selections to unique family selections. */
export function normalizeFrameChoices(
  ids: unknown[],
  templates: StripTemplateSummary[],
): string[] {
  const valid = new Set([
    '',
    ...groupFrameChoices(templates, 4).map(({ id }) => id),
  ]);
  return [
    ...new Set(
      ids.flatMap((id) => {
        if (typeof id !== 'string') return [];
        const template = templates.find((item) => item.id === id);
        const key = template ? frameChoiceId(template) : id;
        return valid.has(key) ? [key] : [];
      }),
    ),
  ];
}
