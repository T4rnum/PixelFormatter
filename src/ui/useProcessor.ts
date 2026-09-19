import { useEffect, useRef, useState } from 'react';
import type { IndexedImage, PaletteEdits, Raster, Settings } from '../core/types';
import type { WorkerRequest, WorkerResponse } from '../worker/protocol';

export function useProcessor(source: Raster | null, settings: Settings) {
  const workerRef = useRef<Worker | null>(null);
  const sequence = useRef(0),
    activeId = useRef(0);
  const [failure, setFailure] = useState('');
  const [completed, setCompleted] = useState<{
    source: Raster;
    settings: Settings;
    id: number;
    image: IndexedImage;
  } | null>(null);
  const pending = useRef<{ source: Raster; settings: Settings; id: number } | null>(null);
  const active = useRef<typeof pending.current>(null);
  const workerSource = useRef<Raster | null>(null);
  const exportTask = useRef<{
    id: number;
    resolve: (bytes: Uint8Array) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const sendNext = useRef(() => {});
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../worker/processor.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      setFailure('workerError');
      return;
    }
    workerRef.current = worker;
    const send = (message: WorkerRequest) => worker.postMessage(message);
    sendNext.current = () => {
      if (active.current || !pending.current) return;
      const job = pending.current;
      pending.current = null;
      active.current = job;
      if (workerSource.current !== job.source) {
        send({ type: 'source', source: job.source });
        workerSource.current = job.source;
      }
      send({ type: 'process', id: job.id, settings: job.settings });
    };
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (exportTask.current?.id === message.id) {
        if (message.type === 'export') exportTask.current.resolve(message.bytes);
        else if (message.type === 'error') exportTask.current.reject(new Error(message.message));
        exportTask.current = null;
        return;
      }
      const job = active.current;
      if (job?.id === message.id) {
        if (activeId.current === message.id) {
          if (message.type === 'result') {
            setCompleted({ ...job, image: message.image });
            setFailure('');
          } else if (message.type === 'error') setFailure(message.message);
        }
        active.current = null;
        sendNext.current();
      }
    };
    worker.onerror = () => {
      setFailure('workerError');
      active.current = null;
      exportTask.current?.reject(new Error('workerError'));
      exportTask.current = null;
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
      active.current = null;
      workerSource.current = null;
      exportTask.current?.reject(new Error('workerError'));
      exportTask.current = null;
    };
  }, []);
  useEffect(() => {
    const id = ++sequence.current;
    activeId.current = id;
    setFailure('');
    pending.current = null;
    if (!source) {
      setCompleted(null);
      return;
    }
    const timer = setTimeout(() => {
      pending.current = { source, settings, id };
      sendNext.current();
    }, 100);
    return () => clearTimeout(timer);
  }, [source, settings]);
  const ready =
    !!completed && completed.source === source && completed.settings === settings && !failure;
  const exportPNG = (edits: PaletteEdits, scale: number): Promise<Uint8Array> => {
    if (!ready || !workerRef.current || exportTask.current)
      return Promise.reject(new Error('stale'));
    const id = ++sequence.current;
    return new Promise((resolve, reject) => {
      exportTask.current = { id, resolve, reject };
      workerRef.current!.postMessage({
        type: 'export',
        id,
        resultId: completed!.id,
        edits,
        scale,
      } satisfies WorkerRequest);
    });
  };
  return {
    image: completed?.source === source ? completed.image : null,
    ready,
    failure,
    exportPNG,
  };
}
