interface FrameResult {
  success: boolean;
  format: string;
  width: number;
  height: number;
  stride: number;
  buffer?: ArrayBuffer;
  error?: string;
}

interface ScreenshotBuffer {
  capture(callback: (frame: FrameResult) => void): void;
  close(): void;
}

interface RawScreenshotApi {
  createScreenshotBuffer?: (options: { format: "rgba" }, callback: (result: {
    success: boolean; screenshotBuffer?: ScreenshotBuffer; error?: string;
  }) => void) => void;
}

/** Keep one request in flight and discard callbacks after a game session ends. */
export function createOcrGameCapture() {
  const media = overwolf.media as RawScreenshotApi | undefined;
  if (!media?.createScreenshotBuffer) return null;
  let handle: ScreenshotBuffer | undefined;
  let closed = false;

  function open() {
    return new Promise<ScreenshotBuffer>((resolve, reject) => {
      media!.createScreenshotBuffer!({ format: "rgba" }, (result) => {
        if (!result.success || !result.screenshotBuffer) {
          reject(new Error(result.error ?? "Screenshot buffer could not be created"));
          return;
        }
        if (closed) {
          result.screenshotBuffer.close();
          reject(new Error("Screenshot buffer closed"));
          return;
        }
        resolve(handle = result.screenshotBuffer);
      });
    });
  }

  return {
    async next() {
      const buffer = handle ?? await open();
      return new Promise<ImageData>((resolve, reject) => {
        buffer.capture((frame) => {
          if (closed || !frame.success || frame.format !== "rgba" || !frame.buffer
              || frame.width <= 0 || frame.height <= 0 || frame.stride !== frame.width * 4
              || frame.buffer.byteLength !== frame.stride * frame.height) {
            reject(new Error(frame.error ?? "Invalid game screenshot"));
            return;
          }
          try {
            resolve(new ImageData(new Uint8ClampedArray(frame.buffer), frame.width, frame.height));
          } catch (error) {
            reject(error);
          }
        });
      });
    },
    close() {
      closed = true;
      handle?.close();
    },
  };
}
