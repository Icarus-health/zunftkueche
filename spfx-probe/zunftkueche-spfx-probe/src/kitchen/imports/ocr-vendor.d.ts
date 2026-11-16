declare module '*tesseract.esm.min.mjs' {
  interface Worker {
    recognize(image: Blob): Promise<{ data: { text: string } }>;
    terminate(): Promise<unknown>;
  }
  const tesseract: { createWorker(language: string, oem: number, options: object): Promise<Worker> };
  export default tesseract;
}
