import { createContext, useContext } from "react";
import type { ThumbnailService } from "../preview/thumbnails";
import type { Renderer } from "../renderer/types";

export interface RenderServices {
  renderer: Renderer;
  thumbnails: ThumbnailService;
}

export const RendererContext = createContext<RenderServices | null>(null);

export function useRenderServices(): RenderServices {
  const ctx = useContext(RendererContext);
  if (!ctx) throw new Error("RendererContext missing");
  return ctx;
}
