import { getTest } from '../data/repo.js';
import { S } from './strings.ms.js';
import { emptyState } from './components.js';

export const choicesOf = (test) => 'ABCDE'.slice(0, test.layoutConfig.numChoices).split('');
export const keyFilled = (test) => test.key.filter((k) => k !== null).length;
export const keyComplete = (test) => keyFilled(test) === test.layoutConfig.numQuestions;
export const enc = encodeURIComponent;

/** Loads a test or returns { notFound: Node } for the view to return directly. */
export async function loadTest(id) {
  const test = await getTest(id);
  if (!test) return { notFound: emptyState({ title: S.errors.testNotFound, action: { label: S.tests.title, href: '#/' } }) };
  return { test };
}
