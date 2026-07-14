import { describe, expect, it } from 'vitest';
import { latestSubmittedByDept, type SubmissionRow, type SubmissionStatusRow } from '../data';

/**
 * Regle de consolidation du workflow de validation :
 * la derniere version SOUMISE NON REJETEE fait foi.
 */

function row(departmentId: string, version: number, status: SubmissionStatusRow): SubmissionRow {
  return {
    id: `${departmentId}-v${version}`,
    department_id: departmentId,
    version,
    status,
    created_by: 'u1',
    submitted_at: status === 'draft' ? null : '2027-01-10T10:00:00Z',
    created_at: '2027-01-01T10:00:00Z',
    decided_by: status === 'approved' || status === 'rejected' ? 'u2' : null,
    decided_at: status === 'approved' || status === 'rejected' ? '2027-01-15T10:00:00Z' : null,
    decision_note: status === 'rejected' ? 'Enveloppe depassee' : null,
  };
}

describe('latestSubmittedByDept : derniere version soumise non rejetee', () => {
  it('ignore les brouillons', () => {
    const map = latestSubmittedByDept([row('d1', 1, 'submitted'), row('d1', 2, 'draft')]);
    expect(map.get('d1')!.version).toBe(1);
  });

  it('ignore une version rejetee et retombe sur la precedente qui fait foi', () => {
    const map = latestSubmittedByDept([row('d1', 1, 'submitted'), row('d1', 2, 'rejected')]);
    expect(map.get('d1')!.version).toBe(1);
    expect(map.get('d1')!.status).toBe('submitted');
  });

  it('consolide une version validee', () => {
    const map = latestSubmittedByDept([row('d1', 1, 'submitted'), row('d1', 2, 'approved')]);
    expect(map.get('d1')!.version).toBe(2);
    expect(map.get('d1')!.status).toBe('approved');
  });

  it('retient la version la plus recente parmi les non rejetees', () => {
    const map = latestSubmittedByDept([
      row('d1', 1, 'approved'),
      row('d1', 2, 'rejected'),
      row('d1', 3, 'submitted'),
    ]);
    expect(map.get('d1')!.version).toBe(3);
  });

  it('un departement dont toutes les versions sont rejetees ou en brouillon n a aucune navette qui fait foi', () => {
    const map = latestSubmittedByDept([row('d1', 1, 'rejected'), row('d1', 2, 'draft')]);
    expect(map.has('d1')).toBe(false);
  });

  it('traite chaque departement independamment', () => {
    const map = latestSubmittedByDept([
      row('d1', 1, 'submitted'),
      row('d2', 1, 'submitted'),
      row('d2', 2, 'rejected'),
    ]);
    expect(map.get('d1')!.version).toBe(1);
    expect(map.get('d2')!.version).toBe(1);
    expect(map.size).toBe(2);
  });
});
