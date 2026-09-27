// Export the visible record, never the signed recovery token or session credentials.
export function buildResultExport(session, exportedAt = new Date().toISOString()) {
  return {
    project: '마음연습실', version: '0.2.0', exportedAt,
    mode: session.mode, case: session.case, result: session.result,
    milestones: session.milestones, notes: session.notes,
    messages: session.messages.map(({ id, role, text }, index) => ({ order: index + 1, id, role, text }))
  };
}
