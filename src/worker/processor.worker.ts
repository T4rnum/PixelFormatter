import { applyEdits, createProcessor } from '../core/pipeline';
import type { IndexedImage, Raster } from '../core/types';
import { encodePNG } from '../io/png';
import type { WorkerRequest, WorkerResponse } from './protocol';

const process = createProcessor();
let source: Raster | null = null;
let last: { id: number; image: IndexedImage } | null = null;
const scope = self as unknown as { postMessage: (message: WorkerResponse, transfer: Transferable[]) => void };
const respond = (message: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'source') { source = message.source; last = null; return; }
  try {
    if (message.type === 'process') {
      if (!source) throw new Error('decode');
      const image = process(source, message.settings);
      last = { id: message.id, image };
      respond({ type: 'result', id: message.id, image });
    } else {
      if (!last || last.id !== message.resultId) throw new Error('stale');
      const bytes = encodePNG(applyEdits(last.image, message.edits), message.scale);
      respond({ type: 'export', id: message.id, bytes }, [bytes.buffer]);
    }
  } catch (error) { respond({ type: 'error', id: message.id, message: error instanceof Error ? error.message : 'processing' }); }
};
