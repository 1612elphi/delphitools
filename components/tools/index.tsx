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
import { JsonFormatterTool } from "./json-formatter";
import { MarkdownPreviewTool } from "./markdown-preview";
import { ImageTracerTool } from "./image-tracer";
import { GuillotineDirectorTool } from "./guillotine-director";
import { PdfPreflightTool } from "./pdf-preflight";
import { CaseConverterTool } from "./case-converter";
import { TextDiffTool } from "./text-diff";

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
  "json-formatter": JsonFormatterTool,
  "markdown-preview": MarkdownPreviewTool,
  "image-tracer": ImageTracerTool,
  "guillotine-director": GuillotineDirectorTool,
  "pdf-preflight": PdfPreflightTool,
  "case-converter": CaseConverterTool,
  "text-diff": TextDiffTool,
};
