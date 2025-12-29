"use client";

import { PxToRemTool } from "./px-to-rem";
import { WordCounterTool } from "./word-counter";
import { QrGeneratorTool } from "./qr-generator";
import { ImageConverterTool } from "./image-converter";
import { RegexTesterTool } from "./regex-tester";

export const toolComponents: Record<string, React.ComponentType> = {
  "px-to-rem": PxToRemTool,
  "word-counter": WordCounterTool,
  "qr-genny": QrGeneratorTool,
  "image-converter": ImageConverterTool,
  "regex-tester": RegexTesterTool,
};
