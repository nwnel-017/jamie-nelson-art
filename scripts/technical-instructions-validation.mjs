// Keep this worker dependency-free: execution preparation runs before npm install.
export const MAX_INSTRUCTION_BYTES = 128 * 1024;

export function validateTechnicalInstructions(value) {
  const invalid = () => { throw new Error('Invalid technical instructions'); };
  const object = (item, keys) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).length !== keys.length ||
        keys.some(key => !Object.hasOwn(item, key))) invalid();
  };
  const text = (item, max = 4000) => {
    if (typeof item !== 'string' || !item.trim() || [...item].length > max) invalid();
  };
  const list = (items, check = text, max = 100, min = 0) => {
    if (!Array.isArray(items) || items.length < min || items.length > max) invalid();
    items.forEach(item => check(item));
  };
  const file = item => {
    text(item, 500);
    if (item.startsWith('/') || /^[a-z]:/i.test(item) || item.includes('\\') ||
        item.includes('\0') || item.split('/').some(part => !part || part === '.' || part === '..')) invalid();
  };
  object(value, ['objective', 'tasks', 'verification_steps', 'constraints', 'blockers']);
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_INSTRUCTION_BYTES) invalid();
  text(value.objective);
  const ids = new Set();
  list(value.tasks, task => {
    object(task, ['id', 'description', 'files', 'acceptance_criteria']);
    text(task.id, 80);
    if (ids.has(task.id)) invalid();
    ids.add(task.id);
    text(task.description);
    list(task.files, file, 50);
    list(task.acceptance_criteria, text, 100, 1);
  });
  list(value.verification_steps);
  list(value.constraints);
  list(value.blockers);
  if (!value.tasks.length && !value.blockers.length) invalid();
  return value;
}
