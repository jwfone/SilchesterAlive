// Reconstruction notes (assets/key-plans/<id>.about.md), each bundled as its own
// small chunk and fetched only when the viewer's "How it was made" tab needs it.
const NOTES = import.meta.glob<string>('../../../assets/key-plans/*.about.md', { query: '?raw', import: 'default' });

/** The notes' Markdown for a building, or null if it has none. */
export async function loadAboutNotes(id: string): Promise<string | null> {
  const load = NOTES[`../../../assets/key-plans/${id}.about.md`];
  return load ? load() : null;
}
