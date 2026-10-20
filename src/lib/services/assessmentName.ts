/** Default questionnaire name for an assessment started from a template. */
export function assessmentName(templateName: string): string {
  const name = templateName.trim();
  return /\bassessment$/i.test(name) ? name : `${name} Assessment`;
}
