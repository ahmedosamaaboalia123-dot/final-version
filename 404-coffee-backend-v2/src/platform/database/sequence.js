import { Sequence } from './sequence.model.js';

export async function nextSequence(name, context = {}) {
  const model = context.sequenceModel ?? Sequence;
  const counter = await model.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, new: true, session: context.session, setDefaultsOnInsert: true }
  );
  return counter.value;
}
