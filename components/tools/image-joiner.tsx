"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Trash2, ChevronUp, ChevronDown, Rows3, Columns3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFilePaste } from "@/hooks/use-file-paste";

enum JoinDirection {
  Horizontally = "Horizontally",
  Vertically = "Vertically",
}

/** Represents an image file uploaded by the user. */
class UploadedImage {
  #file: File;
  image: HTMLImageElement;

  constructor(file: File, image: HTMLImageElement) {
    this.#file = file;
    this.image = image;
  }

  /** Create an UploadedImage by asynchronously loading the provided File. */
  static async loadFile(file: File): Promise<UploadedImage> {
    const img = new Image();
    const url = URL.createObjectURL(file);

    try {
      img.src = url;
      await img.decode();
      return new UploadedImage(file, img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Returns the filename of this uploaded image without the extension. */
  getName(): string {
    return this.#file.name.replace(/\.[^.]+$/, "");
  }
}

export function ImageJoinerTool() {
  const [joinDirection, setJoinDirection] = useState(JoinDirection.Vertically)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      readFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of e.target.files ?? [])
      readFile(file);
  };

  const readFile = (file: File) => {
    UploadedImage.loadFile(file).then(uploadedImage => {
      setUploadedImages(uploadedImages => uploadedImages.concat(uploadedImage));
    });
  };

  useFilePaste(readFile, "image/*");
  
  const remove = (uploadedImage: UploadedImage) => {
    setUploadedImages(uploadedImages => uploadedImages.filter(el => el != uploadedImage));
  };

  const moveUp = (uploadedImage: UploadedImage) => {
    setUploadedImages(uploadedImages => {
      const index = uploadedImages.indexOf(uploadedImage);

      if (index <= 0) {
        return uploadedImages;
      }

      return uploadedImages
        .toSpliced(index, 1)
        .toSpliced(index - 1, 0, uploadedImage);
    });
  };

  const moveDown = (uploadedImage: UploadedImage) => {
    setUploadedImages(uploadedImages => {
      const index = uploadedImages.indexOf(uploadedImage);

      if (index === -1 || index + 1 >= uploadedImages.length) {
        return uploadedImages;
      }

      return uploadedImages
        .toSpliced(index, 1)
        .toSpliced(index + 1, 0, uploadedImage);
    });
  };

  const clear = () => {
    setUploadedImages([]);
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;

      const imageUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");

      try {
        downloadLink.href = imageUrl;
        downloadLink.download = `${uploadedImages.map(image => image.getName()).join(' ')}.${joinDirection.toLowerCase()}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
      } finally {
        URL.revokeObjectURL(imageUrl);
        document.body.removeChild(downloadLink);
      }
    }, "image/png");
  };


  /** Calculate the total dimensions of the collection of images stacked horizontally or vertically.
   * @returns The width and height needed to fit the images stacked in the given direction
   */
  const calculateStackedDimensions = () => {
    if (joinDirection === JoinDirection.Horizontally) {
      return [
        uploadedImages.reduce((acc, cur) => acc + cur.image.width, 0),
        uploadedImages.reduce((acc, cur) => Math.max(acc, cur.image.height), 0)
      ];
    } else { // Vertically
      return [
        uploadedImages.reduce((acc, cur) => Math.max(acc, cur.image.width), 0),
        uploadedImages.reduce((acc, cur) => acc + cur.image.height, 0)
      ];
    }
  };

  const joinImages = () => {
    const [width, height] = calculateStackedDimensions();

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // we will be overwriting everything, but if an image is transparent the old content could show through
    ctx.clearRect(0, 0, width, height);

    let x = 0;
    let y = 0;

    for (const uploadedImage of uploadedImages) {
      const image = uploadedImage.image;

      if (joinDirection === JoinDirection.Horizontally) {
        y = Math.floor((height - image.height) / 2);
        ctx.drawImage(image, x, y);
        x += image.width;
      } else { // Vertically
        x = Math.floor((width - image.width) / 2);
        ctx.drawImage(image, x, y);
        y += image.height;
      }
    }

    downloadImage();
  };

  return (
    // contain:inline-size stops the filename from stretching out <main> by having a large intrinsic size
    <div className="space-y-6 min-w-0 max-w-full [contain:inline-size]">
      <canvas ref={canvasRef} className="hidden" />

      <div className="border-2 border-border">
        {/* Header bar */}
        {uploadedImages.length > 0 &&
          <div className="flex min-h-14 items-stretch border-b-2 border-border">
            <span className="flex flex-1 items-center px-4 font-bold">Images to join</span>
            <Button
              variant="ghost"
              onClick={clear}
              className="h-auto gap-2 self-stretch rounded-none border-l border-border px-5"
            >
              <Trash2 className="size-4" />
              Clear
            </Button>
          </div>
        }

        {/* Uploaded images list */}
        {uploadedImages.map(uploadedImage =>
          <div className="flex min-w-0 min-h-14 items-stretch border-b-2 border-border" key={uploadedImage.image.src}>
            <img className="h-14 w-14 shrink-0 object-cover" src={uploadedImage.image.src}/>
            <div className="flex min-w-0 flex-1 items-center px-4">
              <span className="truncate">
                {uploadedImage.getName()}
              </span>
            </div>
            <Button
              variant="ghost"
              onClick={() => moveUp(uploadedImage)}
              className="h-auto shrink-0 gap-2 self-stretch rounded-none border-l border-border px-5"
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => moveDown(uploadedImage)}
              className="h-auto shrink-0 gap-2 self-stretch rounded-none border-l border-border px-5"
            >
              <ChevronDown className="size-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={() => remove(uploadedImage)}
              className="h-auto shrink-0 gap-2 self-stretch rounded-none border-l border-border px-5"
            >
              <X className="size-4" />
              <span className="hidden sm:inline">Remove</span>
            </Button>
          </div>
        )}

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => document.getElementById("splitter-input")?.click()}
        >
          <input
            id="splitter-input"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />
          <Upload className="size-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">{uploadedImages.length ? "Drop additional images here" : "Drop images here"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            PNG, JPG, or any image format, or paste
          </p>
        </div>
      </div>

      {/* Direction Switcher */}
      <div className="border-2 border-border">
        <div className="segmented grid-cols-2">
          {Object.values(JoinDirection).map(direction =>
            <Button
              key={direction}
              type="button"
              role="tab"
              aria-selected={joinDirection === direction}
              onClick={() => setJoinDirection(direction)}
              variant={joinDirection === direction ? "default" : "outline"}
              className="flex h-auto justify-center gap-3 p-3"
            >{direction}</Button>
          )}
        </div>

        {/* Join Button */}
        <Button
          size="lg"
          className="w-full h-14 text-lg font-bold rounded-none border-0"
          onClick={joinImages}
          disabled={uploadedImages.length < 2}
        >
          {
            uploadedImages.length >= 2 ?
            joinDirection === JoinDirection.Horizontally ?
            <><Columns3 className="size-5 mr-2" /> Join {uploadedImages.length} images horizontally ({calculateStackedDimensions().join('x')})</> :
            <><Rows3 className="size-5 mr-2" /> Join {uploadedImages.length} images vertically ({calculateStackedDimensions().join('x')})</> :
            <>Upload at least two images</>
          }
        </Button>
      </div>
    </div>
  );
}

