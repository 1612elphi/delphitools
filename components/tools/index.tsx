"use client";

import { PxToRemTool } from "./px-to-rem";
import { WordCounterTool } from "./word-counter";
import { QrGeneratorTool } from "./qr-generator";
import { ImageConverterTool } from "./image-converter";
import { RegexTesterTool } from "./regex-tester";
import { SciCalcTool } from "./sci-calc";
import { GraphCalcTool } from "./graph-calc";
import { AlgebraCalcTool } from "./algebra-calc";
import { BaseConverterTool } from "./base-converter";
import { TimeCalcTool } from "./time-calc";
import { UnitConverterTool } from "./unit-converter";
import { EncoderTool } from "./encoder";
import { ImageTracerTool } from "./image-tracer";

export const toolComponents: Record<string, React.ComponentType> = {
  "px-to-rem": PxToRemTool,
  "word-counter": WordCounterTool,
  "qr-genny": QrGeneratorTool,
  "image-converter": ImageConverterTool,
  "regex-tester": RegexTesterTool,
  "sci-calc": SciCalcTool,
  "graph-calc": GraphCalcTool,
  "algebra-calc": AlgebraCalcTool,
  "base-converter": BaseConverterTool,
  "time-calc": TimeCalcTool,
  "unit-converter": UnitConverterTool,
  "encoder": EncoderTool,
  "image-tracer": ImageTracerTool,
};
