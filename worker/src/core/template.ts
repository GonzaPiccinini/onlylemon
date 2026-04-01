export function applyTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, String(value));
  }, template);
}
