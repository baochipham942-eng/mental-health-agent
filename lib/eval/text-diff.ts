import { diffChars } from 'diff';

export interface DiffSegment {
  value: string;
  type: 'equal' | 'added' | 'removed';
}

export function computeTextDiff(reference: string, actual: string): DiffSegment[] {
  const changes = diffChars(reference, actual);
  return changes.map(c => ({
    value: c.value,
    type: c.added ? 'added' : c.removed ? 'removed' : 'equal',
  }));
}
