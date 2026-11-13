import type { Config, Page, Snapshot } from "./core/model";
import type { Rect } from "./core/LayoutManager";
export type PageEvent = {
  loaded?: boolean;
  id: string;
  title?: string;
  url?: string;
  error?: string;
};
declare global {
  interface Window {
    browser: {
      settingsAction(action: string): Promise<Record<string, unknown>>;
      onCloseFlush(fn: () => void): () => void;
      closeReady(config: Config): Promise<void>;
      hideStash(): Promise<void>;
      onStashDrag(
        fn: (
          id: string,
          targets: { slot: number; rect: Rect; stashId?: string }[],
        ) => void,
      ): () => void;
      newPage(url: string): Promise<void>;
      showStash(rect: Rect): Promise<void>;
      zoomPage(id: string, direction: "in" | "out" | "reset"): Promise<void>;
      onZoomShortcut(
        fn: (direction: "in" | "out" | "reset") => void,
      ): () => void;
      exchange(config: Config, from: number, to: number): Promise<void>;
      onPageFocus(fn: (id: string) => void): () => void;
      showScale(id: string, rect: Rect, locked: boolean): Promise<void>;
      hideScale(): Promise<void>;
      log(event: string, details: unknown): Promise<void>;
      beginDrag(
        id: string,
        targets: { slot: number; rect: Rect; stashId?: string }[],
      ): Promise<void>;
      onDragFinished(fn: () => void): () => void;
      endDrag(): Promise<void>;
      showVolume(id: string, rect: Rect): Promise<void>;
      hideVolume(): Promise<void>;
      onSession(fn: (snapshot: Snapshot, config: Config) => void): () => void;
      presentation(value: boolean): Promise<void>;
      load(): Promise<Config>;
      save(config: Config): Promise<Config>;
      bounds(
        items: { id: string; rect: Rect; scale: Page["scale"] }[],
      ): Promise<void>;
      navigate(id: string, action: string, url?: string): Promise<void>;
      transfer(action: string, scope?: string): Promise<Config | null>;
      onPage(fn: (event: PageEvent) => void): () => void;
    };
  }
}
