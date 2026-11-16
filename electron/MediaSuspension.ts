import type { WebContents } from "electron";

// Executed as a fixed script in each frame; no website input or identifiers leave it.
export const suspendMedia = `(() => {
 const key=Symbol.for('multiview.media.suspension');
 if(window[key])return;
 const state={items:new Map(),cancelled:false};window[key]=state;
 state.cancel=event=>{if(event.isTrusted)state.cancelled=true;};
 for(const type of ['pointerdown','keydown'])document.addEventListener(type,state.cancel,true);
 state.prune=()=>{for(const [media,item]of state.items)if(!media.isConnected||media.currentSrc!==item.src||media.srcObject!==item.stream)state.items.delete(media);};
 state.pause=event=>{state.prune();const media=event.target;if(!(media instanceof HTMLMediaElement))return;
   if(state.items.has(media)){if(!state.items.get(media).ownPause)state.items.get(media).cancelled=true;else state.items.get(media).ownPause=false;}
 };
 document.addEventListener('pause',state.pause,true);
 state.play=event=>{state.prune();const media=event.target;if(media instanceof HTMLMediaElement&&!media.paused){let item=state.items.get(media);if(!item){item={src:media.currentSrc,stream:media.srcObject,ownPause:true,cancelled:false};state.items.set(media,item);}else item.ownPause=true;media.pause();}};
 document.addEventListener('play',state.play,true);
 for(const media of document.querySelectorAll('audio,video'))if(!media.paused&&!media.ended){
   state.items.set(media,{src:media.currentSrc,stream:media.srcObject,ownPause:true,cancelled:false});media.pause();
 }
})()`;
export const resumeMedia = `(() => {
 const key=Symbol.for('multiview.media.suspension'),state=window[key];if(!state)return;
 delete window[key];
 for(const type of ['pointerdown','keydown'])document.removeEventListener(type,state.cancel,true);
 document.removeEventListener('pause',state.pause,true);document.removeEventListener('play',state.play,true);
 for(const [media,item]of state.items)if(!state.cancelled&&!item.cancelled&&media.isConnected&&media.paused&&media.currentSrc===item.src&&media.srcObject===item.stream)media.play().catch(()=>{});
})()`;
export class MediaSuspension {
  private suspended = new Set<string>();
  apply(id: string, wc: WebContents, pause: boolean, refresh = false) {
    if (refresh && !pause && !this.suspended.has(id)) return;
    if (!refresh && this.suspended.has(id) === pause) return;
    if (pause) this.suspended.add(id);
    else this.suspended.delete(id);
    for (const frame of wc.mainFrame.framesInSubtree)
      void frame
        .executeJavaScript(pause ? suspendMedia : resumeMedia)
        .catch(() => {});
  }
  forget(id: string) {
    this.suspended.delete(id);
  }
}
