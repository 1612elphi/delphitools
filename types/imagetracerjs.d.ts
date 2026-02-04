declare module "imagetracerjs" {
  interface ImageTracerOptions {
    corsenabled?: boolean
    ltres?: number
    qtres?: number
    pathomit?: number
    rightangleenhance?: boolean
    colorsampling?: number
    numberofcolors?: number
    mincolorratio?: number
    colorquantcycles?: number
    layering?: number
    strokewidth?: number
    linefilter?: boolean
    scale?: number
    roundcoords?: number
    viewbox?: boolean
    desc?: boolean
    lcpr?: number
    qcpr?: number
    blurradius?: number
    blurdelta?: number
    pal?: Array<{ r: number; g: number; b: number; a: number }>
  }

  interface ImageTracerStatic {
    imageToSVG(url: string, callback: (svg: string) => void, options?: string | ImageTracerOptions): void
    imagedataToSVG(imgd: ImageData, options?: string | ImageTracerOptions): string
    imageToTracedata(url: string, callback: (tracedata: unknown) => void, options?: string | ImageTracerOptions): void
    imagedataToTracedata(imgd: ImageData, options?: string | ImageTracerOptions): unknown
    optionpresets: Record<string, ImageTracerOptions>
  }

  const ImageTracer: ImageTracerStatic
  export default ImageTracer
}
